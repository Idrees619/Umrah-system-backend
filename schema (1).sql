-- ============================================================
--  نظام نقل العمرة — قاعدة البيانات الكاملة v3
--  شغّل هذا في Supabase SQL Editor (من الصفر)
--  إذا عندك بيانات قديمة: DROP SCHEMA public CASCADE; CREATE SCHEMA public; أولاً
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
-- 1. الموردون (شركات النقل الخارجية)
-- ══════════════════════════════════════════
CREATE TABLE suppliers (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(150) NOT NULL,
    phone        VARCHAR(30),
    country      VARCHAR(60),
    notes        TEXT,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 2. الباصات / المركبات
-- ══════════════════════════════════════════
CREATE TABLE vehicles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number     VARCHAR(30) UNIQUE NOT NULL,
    vehicle_type     VARCHAR(20) NOT NULL DEFAULT 'باص'
                     CHECK (vehicle_type IN ('باص','كوستر','هايس','سيارة')),
    capacity         INTEGER NOT NULL DEFAULT 45,
    current_location VARCHAR(20) DEFAULT 'جدة'
                     CHECK (current_location IN ('مكة','مدينة','جدة','في الطريق')),
    status           VARCHAR(20) DEFAULT 'متاح'
                     CHECK (status IN ('متاح','مشغول','صيانة','خارج الخدمة')),
    notes            TEXT,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 3. السائقون (من الشركة)
-- ══════════════════════════════════════════
CREATE TABLE drivers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    phone               VARCHAR(30) UNIQUE NOT NULL,
    nationality         VARCHAR(50),
    id_number           VARCHAR(30),
    id_expiry           DATE,
    license_number      VARCHAR(30),
    license_expiry      DATE,
    default_vehicle_id  UUID REFERENCES vehicles(id),
    current_location    VARCHAR(20) DEFAULT 'جدة'
                        CHECK (current_location IN ('مكة','مدينة','جدة','في الطريق')),
    status              VARCHAR(20) DEFAULT 'متاح'
                        CHECK (status IN ('متاح','مشغول','خارج الخدمة')),
    notes               TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 4. السائقون الخارجيون (تابعون للمورد)
-- ══════════════════════════════════════════
CREATE TABLE external_drivers (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id  UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    phone        VARCHAR(30),
    plate_number VARCHAR(30),
    vehicle_type VARCHAR(20) DEFAULT 'باص',
    notes        TEXT,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 5. الحجوزات
-- ══════════════════════════════════════════
CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number  SERIAL UNIQUE,
    group_number    VARCHAR(60),
    group_name      VARCHAR(200),
    guest_name      VARCHAR(200),
    company_name    VARCHAR(200),
    agent_name      VARCHAR(150),
    agent_phone     VARCHAR(30),
    nationality     VARCHAR(60),
    passenger_count INTEGER NOT NULL DEFAULT 1,
    template_type   VARCHAR(50),
    arrival_date    DATE,
    departure_date  DATE,
    status          VARCHAR(30) DEFAULT 'نشط'
                    CHECK (status IN (
                        'نشط','قيد التنفيذ','منتهي','ملغي',
                        'تحتاج-مراجعة','متابعة-فقط','نقل-مستأجر'
                    )),
    invoice_ref     VARCHAR(100),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 6. حركات التشغيل
-- ══════════════════════════════════════════
CREATE TABLE movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,

    -- نوع الحركة
    movement_type   VARCHAR(20) NOT NULL
                    CHECK (movement_type IN ('وصول','تنقل','مزارات','مغادرة')),

    -- التوقيت
    movement_date   DATE NOT NULL,
    movement_time   TIME NOT NULL,
    estimated_duration_minutes INTEGER DEFAULT 90,

    -- المسار
    from_city       VARCHAR(30),
    to_city         VARCHAR(30),
    from_location   VARCHAR(200),   -- الفندق / الموقع من
    to_location     VARCHAR(200),   -- الفندق / الموقع إلى
    flight_number   VARCHAR(30),

    -- عدد الباصات
    bus_count       INTEGER DEFAULT 1,

    -- نوع السائق: داخلي أم خارجي
    driver_type     VARCHAR(10) DEFAULT 'internal'
                    CHECK (driver_type IN ('internal','external')),

    -- السائق الداخلي
    driver_id       UUID REFERENCES drivers(id),
    vehicle_id      UUID REFERENCES vehicles(id),

    -- المورد الخارجي
    supplier_id     UUID REFERENCES suppliers(id),
    ext_driver_id   UUID REFERENCES external_drivers(id),
    ext_driver_name VARCHAR(100),
    ext_driver_phone VARCHAR(30),
    ext_plate_number VARCHAR(30),

    -- الحالة
    status          VARCHAR(30) DEFAULT 'مجدول'
                    CHECK (status IN ('مجدول','جاري','منتهي','ملغي','تحتاج-مراجعة')),
    notes           TEXT,

    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 7. تريب السائق الداخلي
-- ══════════════════════════════════════════
CREATE TABLE driver_trips (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movement_id    UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    driver_id      UUID NOT NULL REFERENCES drivers(id),
    booking_id     UUID NOT NULL REFERENCES bookings(id),
    trip_amount    DECIMAL(10,2) DEFAULT 0,
    trip_notes     TEXT,
    payment_status VARCHAR(20) DEFAULT 'غير-مدفوع'
                   CHECK (payment_status IN ('غير-مدفوع','مدفوع-جزئي','مدفوع')),
    paid_amount    DECIMAL(10,2) DEFAULT 0,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 8. مدفوعات للسائقين
-- ══════════════════════════════════════════
CREATE TABLE driver_payments (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id      UUID NOT NULL REFERENCES drivers(id),
    amount         DECIMAL(10,2) NOT NULL,
    payment_date   DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(20) DEFAULT 'نقد',
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 9. تريب المورد الخارجي
-- ══════════════════════════════════════════
CREATE TABLE supplier_trips (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movement_id    UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    supplier_id    UUID NOT NULL REFERENCES suppliers(id),
    booking_id     UUID NOT NULL REFERENCES bookings(id),
    trip_amount    DECIMAL(10,2) DEFAULT 0,
    trip_notes     TEXT,
    payment_status VARCHAR(20) DEFAULT 'غير-مدفوع'
                   CHECK (payment_status IN ('غير-مدفوع','مدفوع-جزئي','مدفوع')),
    paid_amount    DECIMAL(10,2) DEFAULT 0,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 10. مدفوعات للموردين
-- ══════════════════════════════════════════
CREATE TABLE supplier_payments (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id    UUID NOT NULL REFERENCES suppliers(id),
    amount         DECIMAL(10,2) NOT NULL,
    payment_date   DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(20) DEFAULT 'نقد',
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- 11. سجل تغييرات المواقع
-- ══════════════════════════════════════════
CREATE TABLE location_history (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type   VARCHAR(10) CHECK (entity_type IN ('driver','vehicle')),
    entity_id     UUID NOT NULL,
    from_location VARCHAR(30),
    to_location   VARCHAR(30),
    change_reason VARCHAR(100),
    changed_at    TIMESTAMP DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════
CREATE INDEX idx_movements_date      ON movements(movement_date);
CREATE INDEX idx_movements_booking   ON movements(booking_id);
CREATE INDEX idx_movements_driver    ON movements(driver_id);
CREATE INDEX idx_movements_supplier  ON movements(supplier_id);
CREATE INDEX idx_movements_status    ON movements(status);
CREATE INDEX idx_bookings_status     ON bookings(status);
CREATE INDEX idx_bookings_arrival    ON bookings(arrival_date);
CREATE INDEX idx_driver_trips_driver ON driver_trips(driver_id);
CREATE INDEX idx_supplier_trips_sup  ON supplier_trips(supplier_id);

-- ══════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════

-- VIEW: حركات كاملة مع كل البيانات
CREATE OR REPLACE VIEW movements_full AS
SELECT
    m.id, m.booking_id, m.sort_order,
    m.movement_date, m.movement_time, m.movement_type,
    m.from_city, m.to_city, m.from_location, m.to_location,
    m.flight_number, m.bus_count, m.driver_type,
    m.status, m.notes, m.estimated_duration_minutes,
    -- الحجز
    b.booking_number, b.group_number, b.group_name, b.guest_name,
    b.company_name, b.agent_name, b.agent_phone,
    b.nationality, b.passenger_count,
    -- السائق الداخلي
    d.id          AS driver_id,
    d.name        AS driver_name,
    d.phone       AS driver_phone,
    d.id_number   AS driver_id_number,
    d.current_location AS driver_location,
    -- الباص
    v.id          AS vehicle_id,
    v.plate_number,
    v.vehicle_type,
    -- المورد
    s.id          AS supplier_id,
    s.name        AS supplier_name,
    s.phone       AS supplier_phone,
    -- السائق الخارجي
    m.ext_driver_name,
    m.ext_driver_phone,
    m.ext_plate_number
FROM movements m
JOIN bookings b         ON b.id = m.booking_id
LEFT JOIN drivers  d    ON d.id = m.driver_id
LEFT JOIN vehicles v    ON v.id = m.vehicle_id
LEFT JOIN suppliers s   ON s.id = m.supplier_id;

-- VIEW: رصيد السائقين
CREATE OR REPLACE VIEW driver_balance AS
SELECT
    d.id, d.name AS driver_name, d.phone,
    d.current_location, d.status,
    d.id_number, d.license_number, d.license_expiry,
    d.default_vehicle_id,
    COALESCE(SUM(dt.trip_amount),0)  AS total_earned,
    COALESCE(SUM(dp.amount),0)       AS total_paid,
    COALESCE(SUM(dt.trip_amount),0) - COALESCE(SUM(dp.amount),0) AS balance_due,
    COUNT(DISTINCT dt.movement_id)   AS total_trips
FROM drivers d
LEFT JOIN driver_trips    dt ON dt.driver_id = d.id
LEFT JOIN driver_payments dp ON dp.driver_id = d.id
GROUP BY d.id, d.name, d.phone, d.current_location, d.status,
         d.id_number, d.license_number, d.license_expiry, d.default_vehicle_id;

-- VIEW: رصيد الموردين
CREATE OR REPLACE VIEW supplier_balance AS
SELECT
    s.id, s.name AS supplier_name, s.phone, s.country,
    COALESCE(SUM(st.trip_amount),0)  AS total_earned,
    COALESCE(SUM(sp.amount),0)       AS total_paid,
    COALESCE(SUM(st.trip_amount),0) - COALESCE(SUM(sp.amount),0) AS balance_due,
    COUNT(DISTINCT st.movement_id)   AS total_trips
FROM suppliers s
LEFT JOIN supplier_trips    st ON st.supplier_id = s.id
LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
GROUP BY s.id, s.name, s.phone, s.country;

-- VIEW: إحصائيات الداشبورد
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE)                              AS today_total,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND movement_type='وصول')     AS today_arrivals,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND movement_type='مغادرة')   AS today_departures,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND movement_type='تنقل')     AS today_transfers,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND movement_type='مزارات')   AS today_visits,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND status='تحتاج-مراجعة')   AS needs_review,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE + 1)                          AS tomorrow_total,
    COUNT(*) FILTER (WHERE movement_date = CURRENT_DATE AND driver_id IS NULL
                     AND supplier_id IS NULL)                                          AS unassigned
FROM movements;

-- ══════════════════════════════════════════
-- TRIGGERS
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings  BEFORE UPDATE ON bookings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_movements BEFORE UPDATE ON movements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_drivers   BEFORE UPDATE ON drivers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles  BEFORE UPDATE ON vehicles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- تحديث موقع السائق تلقائياً عند إنهاء حركة
CREATE OR REPLACE FUNCTION sync_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'منتهي' AND OLD.status != 'منتهي' THEN
        IF NEW.driver_id IS NOT NULL THEN
            UPDATE drivers SET current_location = NEW.to_city, status = 'متاح' WHERE id = NEW.driver_id;
            INSERT INTO location_history(entity_type,entity_id,from_location,to_location,change_reason)
            VALUES('driver', NEW.driver_id, NEW.from_city, NEW.to_city, 'إنهاء حركة');
        END IF;
        IF NEW.vehicle_id IS NOT NULL THEN
            UPDATE vehicles SET current_location = NEW.to_city, status = 'متاح' WHERE id = NEW.vehicle_id;
            INSERT INTO location_history(entity_type,entity_id,from_location,to_location,change_reason)
            VALUES('vehicle', NEW.vehicle_id, NEW.from_city, NEW.to_city, 'إنهاء حركة');
        END IF;
    ELSIF NEW.status = 'جاري' AND OLD.status = 'مجدول' THEN
        IF NEW.driver_id  IS NOT NULL THEN UPDATE drivers  SET status='مشغول' WHERE id=NEW.driver_id;  END IF;
        IF NEW.vehicle_id IS NOT NULL THEN UPDATE vehicles SET status='مشغول' WHERE id=NEW.vehicle_id; END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_location
AFTER UPDATE ON movements
FOR EACH ROW EXECUTE FUNCTION sync_location();
