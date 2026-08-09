-- GTLT — índices parciales / expresión a aplicar en migración SQL
-- (Prisma no los expresa en schema.prisma; copiar a la migration cuando se genere)
-- Revisar antes de migrate definitiva.

-- ---------------------------------------------------------------------------
-- 1) PartInstance: una pieza vigente por (tambo, tipo, bajada)
--    Approach: DOS índices parciales (no COALESCE).
--    Motivo: evita el sentinel -1 (que colisionaría si algún día bajada_number
--    admitiera valores ≤0) y deja explícito el caso NULL vs NOT NULL.
--
--    Sin este fix: dos PartInstance de equipo de frío (bajada_number NULL,
--    replaced_at NULL, mismo part_type_id) podrían coexistir en el mismo tambo;
--    usage_counter, alertas y lecturas EKC 202 no sabrían cuál es el vigente.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX part_instances_one_active_per_bajada
  ON part_instances (tambo_id, part_type_id, bajada_number)
  WHERE replaced_at IS NULL
    AND bajada_number IS NOT NULL;

CREATE UNIQUE INDEX part_instances_one_active_tambo_level
  ON part_instances (tambo_id, part_type_id)
  WHERE replaced_at IS NULL
    AND bajada_number IS NULL;

-- ---------------------------------------------------------------------------
-- 2) MilkingSession: un ACTIVE por tambo/fecha/turno
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX milking_sessions_one_active_per_shift
  ON milking_sessions (tambo_id, session_date, shift)
  WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3) Animal: caravana única entre activos/secas en el tambo
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX animals_unique_ear_tag_active
  ON animals (tambo_id, ear_tag)
  WHERE status IN ('ACTIVE', 'DRY')
    AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) ControlLechero / MilkDelivery: no hay unique de negocio por fecha;
--    la corrección es append-only (status + corrects_*_id). Sin índice parcial
--    de unicidad adicional en Fase 1.
-- ---------------------------------------------------------------------------
