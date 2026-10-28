-- Migration: 20261027000001_departments_programs.sql
-- Create departments and programs management tables for institutional flexibility

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name text NOT NULL,
  type text NOT NULL DEFAULT 'college' CHECK (type IN ('college', 'senior_high')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_department ON public.programs(department_name);
CREATE INDEX IF NOT EXISTS idx_programs_type ON public.programs(type);
CREATE INDEX IF NOT EXISTS idx_programs_code ON public.programs(code);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Public read departments'
  ) THEN
    CREATE POLICY "Public read departments" ON public.departments FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'programs' AND policyname = 'Public read programs'
  ) THEN
    CREATE POLICY "Public read programs" ON public.programs FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Admin manage departments'
  ) THEN
    CREATE POLICY "Admin manage departments" ON public.departments
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'super_admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'programs' AND policyname = 'Admin manage programs'
  ) THEN
    CREATE POLICY "Admin manage programs" ON public.programs
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Seed default institution departments
INSERT INTO public.departments (name, code, description)
VALUES
  ('COLLEGE OF BUSINESS AND ACCOUNTANCY', 'CBA', 'College of Business and Accountancy'),
  ('COLLEGE OF COMPUTER STUDIES', 'CCS', 'College of Computer Studies'),
  ('COLLEGE OF EDUCATION', 'COED', 'College of Education'),
  ('COLLEGE OF ENGINEERING', 'COE', 'College of Engineering'),
  ('SENIOR HIGH SCHOOL', 'SHS', 'Senior High School')
ON CONFLICT (name) DO UPDATE SET
  code = EXCLUDED.code,
  description = EXCLUDED.description;

-- Seed default programs
DO $$
DECLARE
  dept_cba uuid;
  dept_ccs uuid;
  dept_coed uuid;
  dept_coe uuid;
  dept_shs uuid;
BEGIN
  SELECT id INTO dept_cba FROM public.departments WHERE name = 'COLLEGE OF BUSINESS AND ACCOUNTANCY';
  SELECT id INTO dept_ccs FROM public.departments WHERE name = 'COLLEGE OF COMPUTER STUDIES';
  SELECT id INTO dept_coed FROM public.departments WHERE name = 'COLLEGE OF EDUCATION';
  SELECT id INTO dept_coe FROM public.departments WHERE name = 'COLLEGE OF ENGINEERING';
  SELECT id INTO dept_shs FROM public.departments WHERE name = 'SENIOR HIGH SCHOOL';

  -- Senior High Programs
  INSERT INTO public.programs (name, code, department_id, department_name, type, description)
  VALUES
    ('Accountancy, Business and Management', 'ABM', dept_shs, 'SENIOR HIGH SCHOOL', 'senior_high', 'Academic Track - ABM'),
    ('Humanities and Social Sciences', 'HUMSS', dept_shs, 'SENIOR HIGH SCHOOL', 'senior_high', 'Academic Track - HUMSS'),
    ('Science, Technology, Engineering, and Mathematics', 'STEM', dept_shs, 'SENIOR HIGH SCHOOL', 'senior_high', 'Academic Track - STEM'),
    ('Technical-Vocational-Livelihood', 'TVL', dept_shs, 'SENIOR HIGH SCHOOL', 'senior_high', 'TVL Track'),
    
    -- College Programs
    ('Bachelor of Elementary Education', 'BEED', dept_coed, 'COLLEGE OF EDUCATION', 'college', 'Prepares students for teaching in elementary school.'),
    ('Bachelor of Science in Accountancy', 'BSA', dept_cba, 'COLLEGE OF BUSINESS AND ACCOUNTANCY', 'college', 'A program that provides general accounting education.'),
    ('Bachelor of Science in Business Administration', 'BSBA', dept_cba, 'COLLEGE OF BUSINESS AND ACCOUNTANCY', 'college', 'A program that provides fundamental business concepts.'),
    ('Bachelor of Science in Civil Engineering', 'BSCE', dept_coe, 'COLLEGE OF ENGINEERING', 'college', 'Focuses on the design, construction, and maintenance of the physical and naturally built environment.'),
    ('Bachelor of Science in Computer Engineering', 'BSCPE', dept_coe, 'COLLEGE OF ENGINEERING', 'college', 'Integrates several fields of computer science and electronic engineering to develop computer hardware and software.'),
    ('Bachelor of Science in Computer Science', 'BSCS', dept_ccs, 'COLLEGE OF COMPUTER STUDIES', 'college', 'Focuses on the study of concepts and theories, algorithmic foundations, implementation and application of information and computing solutions.'),
    ('Bachelor of Science in Information Systems', 'BSIS', dept_ccs, 'COLLEGE OF COMPUTER STUDIES', 'college', 'Focuses on the design and implementation of information systems solutions for business and institutional processes.')
  ON CONFLICT DO NOTHING;
END $$;
