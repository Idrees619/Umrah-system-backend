const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── GET /api/auto-assign/suggestions?date=YYYY-MM-DD ──
router.get('/suggestions', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'يجب تحديد التاريخ' });

    const movesQuery = `
      SELECT m.*, b.passenger_count, b.group_name
      FROM movements m
      JOIN bookings b ON b.id = m.booking_id
      WHERE m.movement_date = $1
        AND m.driver_id IS NULL
        AND m.supplier_id IS NULL
        AND m.status NOT IN ('ملغي','منتهي')
      ORDER BY m.movement_time
    `;
    const movesRes = await pool.query(movesQuery, [date]);
    const movements = movesRes.rows;

    if (movements.length === 0) {
      return res.json({ success: true, data: [], message: 'لا توجد حركات غير معيّنة في هذا اليوم' });
    }

    const driversRes = await pool.query(`
      SELECT d.*, v.plate_number, v.id AS vehicle_id
      FROM drivers d
      LEFT JOIN vehicles v ON v.id = d.default_vehicle_id AND v.status != 'خارج الخدمة'
      WHERE d.is_active = true AND d.status IN ('متاح','مشغول')
    `);
    const drivers = driversRes.rows;

    const tripsRes = await pool.query(`
      SELECT m.driver_id, COUNT(*) AS trip_count,
             COUNT(*) FILTER (WHERE (m.to_city IN ('مكة','مدينة') AND m.from_city IN ('مكة','مدينة') AND m.from_city != m.to_city)) AS long_count
      FROM movements m
      WHERE m.movement_date = $1 AND m.driver_id IS NOT NULL
      GROUP BY m.driver_id
    `, [date]);
    const tripsMap = {};
    tripsRes.rows.forEach(t => { tripsMap[t.driver_id] = t; });

    const data = movements.map(m => {
      const isLong = (m.from_city === 'مكة' && m.to_city === 'مدينة') ||
                     (m.from_city === 'مدينة' && m.to_city === 'مكة') ||
                     (m.from_city === 'جدة' && (m.to_city === 'مكة' || m.to_city === 'مدينة')) ||
                     ((m.from_city === 'مكة' || m.from_city === 'مدينة') && m.to_city === 'جدة');

      const candidates = drivers.filter(d => {
        if (d.current_location === m.from_city) return true;
        if (d.current_location === 'جدة' && (m.from_city === 'مكة' || m.from_city === 'مدينة')) return true;
        if (d.current_location === 'مكة' && m.from_city === 'جدة') return true;
        if (d.current_location === 'مدينة' && m.from_city === 'جدة') return true;
        return false;
      }).filter(d => {
        const t = tripsMap[d.id];
        if (!t) return true;
        if (t.trip_count >= 5) return false;
        if (isLong && t.long_count >= 2) return false;
        if (!isLong && t.trip_count - t.long_count >= 3) return false;
        return true;
      });

      candidates.sort((a, b) => {
        const aTrips = tripsMap[a.id]?.trip_count || 0;
        const bTrips = tripsMap[b.id]?.trip_count || 0;
        if (aTrips !== bTrips) return aTrips - bTrips;
        if (a.current_location === m.from_city && b.current_location !== m.from_city) return -1;
        if (b.current_location === m.from_city && a.current_location !== m.from_city) return 1;
        return 0;
      });

      const suggested = candidates[0] || null;
      return {
        movement_id: m.id,
        movement_time: m.movement_time,
        movement_type: m.movement_type,
        from_city: m.from_city,
        to_city: m.to_city,
        group_name: m.group_name,
        passenger_count: m.passenger_count,
        is_long: isLong,
        suggested_driver: suggested ? {
          id: suggested.id,
          name: suggested.name,
          phone: suggested.phone,
          current_location: suggested.current_location,
          vehicle_id: suggested.vehicle_id,
          plate_number: suggested.plate_number,
        } : null,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/auto-assign/apply ──
router.post('/apply', async (req, res) => {
  const { assignments } = req.body;
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ success: false, error: 'لم يتم إرسال تعيينات' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let applied = 0;
    for (const a of assignments) {
      if (!a.driver_id) continue;
      await client.query(
        `UPDATE movements SET driver_id = $1, vehicle_id = $2, driver_type = 'internal', status = 'مجدول' WHERE id = $3`,
        [a.driver_id, a.vehicle_id || null, a.movement_id]
      );
      applied++;
    }
    await client.query('COMMIT');
    res.json({ success: true, applied });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;