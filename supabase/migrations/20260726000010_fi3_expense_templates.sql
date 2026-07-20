-- ─── FI-3 — Sabit gider şablonları + gider ay damgası ────────────────────────
-- Kira/personel gibi her ay tekrarlayan giderler şablonda; ay başında tek dokunuş
-- ile eklenir (cron YOK — owner kontrolünde, manuel-ödeme ilkesiyle uyumlu).
-- expense_month üretilmiş kolon + (template_id, expense_month) unique → bir şablon
-- ayda en fazla bir kez uygulanır.

CREATE TABLE IF NOT EXISTS public.pitch_expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Diğer',
  amount numeric NOT NULL CHECK (amount > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pitch_expense_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_templates_manage ON public.pitch_expense_templates;
CREATE POLICY expense_templates_manage ON public.pitch_expense_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_expense_templates.pitch_id
            AND ((p.owner_id = (SELECT auth.uid())) OR (p.is_demo AND has_role('OWNER')))) OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_expense_templates.pitch_id
            AND ((p.owner_id = (SELECT auth.uid())) OR (p.is_demo AND has_role('OWNER')))) OR is_admin()
  );

ALTER TABLE public.pitch_expenses
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.pitch_expense_templates(id) ON DELETE SET NULL;

-- Bir şablon aynı ayda en fazla bir kez uygulanabilir (immutable ifade: yıl*100+ay).
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_template_month
  ON public.pitch_expenses(template_id, ((extract(year from expense_date)::int) * 100 + (extract(month from expense_date)::int)))
  WHERE template_id IS NOT NULL;
