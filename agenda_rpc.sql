-- =============================================================================
-- LRB Studio — Agenda pública (GitHub Pages)
-- RPC de solo lectura para mostrar la jornada del barbero a quien tenga el link.
-- Expone ÚNICAMENTE franjas ocupadas: NUNCA nombre, teléfono, notas, precio ni
-- client_id. SECURITY DEFINER: corre como owner, así anon no necesita grants
-- sobre las tablas base (que están revocadas).
--
-- Aplicar una sola vez en el proyecto Supabase compartido.
-- Generated: 2026-09-18
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_agenda(
    p_barber uuid,
    p_date text,
    p_timezone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tz      text;
    v_working int[];
    v_ws      text;
    v_we      text;
    v_exc     jsonb;
    v_exc_day jsonb;
    v_dow     int;
    v_day     date;
    v_closed  boolean := false;
    v_slots   jsonb;
BEGIN
    IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RETURN jsonb_build_object('error', 'invalid_date');
    END IF;

    v_day := p_date::date;

    SELECT timezone, working_days, work_start_time, work_end_time, work_hours_exceptions
    INTO v_tz, v_working, v_ws, v_we, v_exc
    FROM public.profiles
    WHERE id = p_barber;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'profile_not_found');
    END IF;

    v_tz := COALESCE(NULLIF(p_timezone, ''), v_tz, 'UTC');
    v_ws := COALESCE(v_ws, '09:00');
    v_we := COALESCE(v_we, '20:00');

    v_dow := EXTRACT(ISODOW FROM v_day)::int;
    IF v_working IS NULL OR NOT (v_dow = ANY(v_working)) THEN
        v_closed := true;
    END IF;

    v_exc_day := v_exc -> p_date;
    IF v_exc_day IS NOT NULL THEN
        IF COALESCE((v_exc_day->>'closed')::boolean, false) THEN
            v_closed := true;
        END IF;
        IF v_exc_day ? 'start' AND COALESCE(v_exc_day->>'start', '') <> '' THEN
            v_ws := v_exc_day->>'start';
        END IF;
        IF v_exc_day ? 'end' AND COALESCE(v_exc_day->>'end', '') <> '' THEN
            v_we := v_exc_day->>'end';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'start',  to_char(s.st, 'HH24:MI'),
               'end',    to_char(s.en, 'HH24:MI'),
               'status', s.status
           ) ORDER BY s.st), '[]'::jsonb)
    INTO v_slots
    FROM (
        SELECT start_time AS st, end_time AS en, status
        FROM public.appointments
        WHERE user_id = p_barber
          AND status IN ('confirmado', 'pendiente_confirmacion', 'asistido')
          AND (start_time AT TIME ZONE v_tz)::date = v_day
        UNION ALL
        SELECT start_time AS st, end_time AS en, 'bloqueado'::text AS status
        FROM public.time_blocks
        WHERE user_id = p_barber
          AND (start_time AT TIME ZONE v_tz)::date = v_day
    ) s;

    RETURN jsonb_build_object(
        'date',       p_date,
        'timezone',   v_tz,
        'is_closed',  v_closed,
        'work_start', v_ws,
        'work_end',   v_we,
        'slots',      v_slots
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_agenda(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_agenda(uuid, text, text) TO anon, authenticated;
