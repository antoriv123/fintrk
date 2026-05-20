-- Migration: añadir columna error_kind a import_error_reports
-- Fecha: 2026-04-20
-- Contexto: clasificamos cada reporte automaticamente al insertarse para
-- poder filtrar en la vista admin y priorizar los parser_crash sobre los
-- user_reported. Valores: 'parser_crash' | 'zero_tx' | 'weak_result' |
-- 'needs_manual_review' | 'user_reported'.
--
-- NO se aplica automaticamente. El maintainer la ejecuta en Neon cuando
-- tenga backup. El codigo usa COALESCE para que siga funcionando aunque
-- la columna no exista.

ALTER TABLE import_error_reports
  ADD COLUMN IF NOT EXISTS error_kind TEXT DEFAULT 'user_reported';

CREATE INDEX IF NOT EXISTS idx_import_err_kind ON import_error_reports (error_kind);
