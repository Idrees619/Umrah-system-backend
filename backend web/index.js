// src/index.js — API الكامل والمُحدَّث
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const app     = express();

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats    = await db.query('SELECT * FROM dashboard_stats');
    const arrivals = await db.query(`
      SELECT mf.movement_time, mf.group_name, mf.guest_name, mf.passenger_count,
             mf.nationality, mf.from_location, mf.flight_number,
             mf.driver_name, mf.driver_phone, mf.plate_number,
             mf.supplier_name, mf.ext_driver_name, mf.ext_plate_number, mf.driver_type
      FROM movements_full mf
      WHERE mf.movement_date = CURRENT_DATE AND mf.movement_type = 'وصول'
      ORDER BY mf.movement_time`);
    const unassigned = await db.query(`
      SELECT mf.* FROM movements_full mf
      WHERE mf.movement_date >= CURRENT_DATE
        AND mf.driver_id IS NULL AND mf.supplier_id IS NULL
      ORDER BY mf.movement_date, mf.movement_time LIMIT 20`);
    res.json({ success:true, data:{ stats:stats.rows[0], today_arrivals:arrivals.rows, unassigned:unassigned.rows }});
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

// ══════════════════════════════════════════
// MOVEMENTS
// ══════════════════════════════════════════
app.get('/api/movements', async (req, res) => {
  try {
    const { date, date_from, date_to, type, status, driver_type, company, nationality, driver, plate, flight, city_from, city_to } = req.query;
    let q = 'SELECT * FROM movements_full WHERE 1=1';
    const p = [];
    const add = (col, val) => { p.push(val); q += ` AND ${col} = $${p.length}`; };
    const like = (col, val) => { p.push(`%${val}%`); q += ` AND ${col} ILIKE $${p.length}`; };
    if (date)         { p.push(date);      q += ` AND movement_date = $${p.length}`; }
    if (date_from)    { p.push(date_from); q += ` AND movement_date >= $${p.length}`; }
    if (date_to)      { p.push(date_to);   q += ` AND movement_date <= $${p.length}`; }
    if (type)         add('movement_type', type);
    if (status)       add('status', status);
    if (driver_type)  add('driver_type', driver_type);
    if (city_from)    add('from_city', city_from);
    if (city_to)      add('to_city', city_to);
    if (company)      like('company_name', company);
    if (nationality)  like('nationality', nationality);
    if (driver)       like('driver_name', driver);
    if (plate)        { p.push(`%${plate}%`); q += ` AND (plate_number ILIKE $${p.length} OR ext_plate_number ILIKE $${p.length})`; }
    if (flight)       like('flight_number', flight);
    q += ' ORDER BY movement_date, movement_time, sort_order';
    const r = await db.query(q, p);
    res.json({ success:true, data:r.rows, total:r.rows.length });
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

app.get('/api/movements/:id', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM movements_full WHERE id=$1', [req.params.id]);
    res.json({ success:true, data:r.rows[0] });
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

app.post('/api/movements', async (req,res) => {
  try {
    const { booking_id, movement_type, movement_date, movement_time, from_city, to_city,
            from_location, to_location, flight_number, bus_count, driver_type,
            driver_id, vehicle_id, supplier_id, ext_driver_id, ext_driver_name,
            ext_driver_phone, ext_plate_number, status, notes, sort_order, estimated_duration_minutes } = req.body;
    const r = await db.query(`
      INSERT INTO movements(booking_id,movement_type,movement_date,movement_time,from_city,to_city,
        from_location,to_location,flight_number,bus_count,driver_type,driver_id,vehicle_id,
        supplier_id,ext_driver_id,ext_driver_name,ext_driver_phone,ext_plate_number,
        status,notes,sort_order,estimated_duration_minutes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [booking_id,movement_type,movement_date,movement_time,from_city,to_city,
       from_location,to_location,flight_number,bus_count||1,driver_type||'internal',
       driver_id||null,vehicle_id||null,supplier_id||null,ext_driver_id||null,
       ext_driver_name||null,ext_driver_phone||null,ext_plate_number||null,
       status||'مجدول',notes||null,sort_order||0,estimated_duration_minutes||90]);
    res.status(201).json({ success:true, data:r.rows[0] });
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

app.put('/api/movements/:id', async (req,res) => {
  try {
    const { driver_type, driver_id, vehicle_id, supplier_id, ext_driver_id,
            ext_driver_name, ext_driver_phone, ext_plate_number,
            movement_date, movement_time, from_location, to_location,
            flight_number, status, notes, bus_count } = req.body;
    const r = await db.query(`
      UPDATE movements SET
        driver_type=$1, driver_id=$2, vehicle_id=$3, supplier_id=$4,
        ext_driver_id=$5, ext_driver_name=$6, ext_driver_phone=$7, ext_plate_number=$8,
        movement_date=COALESCE($9,movement_date), movement_time=COALESCE($10,movement_time),
        from_location=COALESCE($11,from_location), to_location=COALESCE($12,to_location),
        flight_number=COALESCE($13,flight_number), status=COALESCE($14,status),
        notes=COALESCE($15,notes), bus_count=COALESCE($16,bus_count)
      WHERE id=$17 RETURNING *`,
      [driver_type,driver_id||null,vehicle_id||null,supplier_id||null,ext_driver_id||null,
       ext_driver_name||null,ext_driver_phone||null,ext_plate_number||null,
       movement_date,movement_time,from_location,to_location,flight_number,
       status,notes,bus_count,req.params.id]);
    res.json({ success:true, data:r.rows[0] });
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

app.patch('/api/movements/:id/status', async (req,res) => {
  try {
    await db.query('UPDATE movements SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ success:true });
  } catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

app.delete('/api/movements/:id', async (req,res) => {
  try { await db.query('DELETE FROM movements WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ══════════════════════════════════════════
// BOOKINGS (مُحدَّثة لدعم agent_id)
// ══════════════════════════════════════════
app.get('/api/bookings', async (req,res) => {
  try {
    const { search, status, nationality } = req.query;
    let q = `SELECT b.*, COUNT(m.id) AS movements_count
             FROM bookings b LEFT JOIN movements m ON m.booking_id=b.id WHERE 1=1`;
    const p = [];
    if (status)      { p.push(status);           q += ` AND b.status=$${p.length}`; }
    if (nationality) { p.push(`%${nationality}%`);q += ` AND b.nationality ILIKE $${p.length}`; }
    if (search)      { p.push(`%${search}%`);     q += ` AND (b.group_name ILIKE $${p.length} OR b.company_name ILIKE $${p.length} OR b.agent_name ILIKE $${p.length})`; }
    q += ' GROUP BY b.id ORDER BY b.created_at DESC LIMIT 200';
    const r = await db.query(q, p);
    res.json({ success:true, data:r.rows });
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/bookings/:id', async (req,res) => {
  try {
    const b = await db.query('SELECT * FROM bookings WHERE id=$1',[req.params.id]);
    if (!b.rows.length) return res.status(404).json({success:false,error:'غير موجود'});
    const m = await db.query('SELECT * FROM movements_full WHERE booking_id=$1 ORDER BY movement_date,movement_time,sort_order',[req.params.id]);
    res.json({ success:true, data:{ ...b.rows[0], movements:m.rows }});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ─── POST حجز جديد مع agent_id ───
app.post('/api/bookings', async (req,res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { group_number,group_name,guest_name,company_name,agent_name,agent_phone,
            agent_id, nationality,passenger_count,template_type,arrival_date,departure_date,
            status,invoice_ref,notes,movements=[] } = req.body;
    const br = await client.query(`
      INSERT INTO bookings(group_number,group_name,guest_name,company_name,agent_name,agent_phone,
        agent_id, nationality,passenger_count,template_type,arrival_date,departure_date,
        status,invoice_ref,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [group_number,group_name,guest_name,company_name,agent_name,agent_phone,
       agent_id||null, nationality,passenger_count,template_type||null,arrival_date,departure_date,
       status||'نشط',invoice_ref,notes]);
    const booking = br.rows[0];
    for(let i=0;i<movements.length;i++){
      const m=movements[i];
      await client.query(`
        INSERT INTO movements(booking_id,movement_type,movement_date,movement_time,from_city,to_city,
          from_location,to_location,flight_number,bus_count,status,notes,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [booking.id,m.movement_type,m.movement_date,m.movement_time,m.from_city||null,
         m.to_city||null,m.from_location||m.hotel_from||null,m.to_location||m.hotel_to||null,
         m.flight_number||null,m.bus_count||1,m.status||'مجدول',m.notes||null,i+1]);
    }
    await client.query('COMMIT');
    res.status(201).json({ success:true, data:booking });
  } catch(e){ await client.query('ROLLBACK'); res.status(500).json({success:false,error:e.message}); }
  finally { client.release(); }
});

// ─── PUT تحديث حجز مع agent_id ───
app.put('/api/bookings/:id', async (req,res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { group_number,group_name,guest_name,company_name,agent_name,agent_phone,
            agent_id, nationality,passenger_count,template_type,arrival_date,departure_date,
            status,invoice_ref,notes,movements } = req.body;
    const br = await client.query(`
      UPDATE bookings SET group_number=$1,group_name=$2,guest_name=$3,company_name=$4,
        agent_name=$5,agent_phone=$6,agent_id=$7,nationality=$8,passenger_count=$9,
        template_type=$10,arrival_date=$11,departure_date=$12,status=$13,invoice_ref=$14,notes=$15
      WHERE id=$16 RETURNING *`,
      [group_number,group_name,guest_name,company_name,agent_name,agent_phone,
       agent_id||null, nationality,passenger_count,template_type||null,
       arrival_date,departure_date,status,invoice_ref,notes,req.params.id]);
    if (movements) {
      await client.query('DELETE FROM movements WHERE booking_id=$1',[req.params.id]);
      for(let i=0;i<movements.length;i++){
        const m=movements[i];
        await client.query(`
          INSERT INTO movements(booking_id,movement_type,movement_date,movement_time,from_city,to_city,
            from_location,to_location,flight_number,bus_count,status,notes,sort_order)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [req.params.id,m.movement_type,m.movement_date,m.movement_time,m.from_city||null,
           m.to_city||null,m.from_location||m.hotel_from||null,m.to_location||m.hotel_to||null,
           m.flight_number||null,m.bus_count||1,m.status||'مجدول',m.notes||null,i+1]);
      }
    }
    await client.query('COMMIT');
    res.json({ success:true, data:br.rows[0] });
  } catch(e){ await client.query('ROLLBACK'); res.status(500).json({success:false,error:e.message}); }
  finally { client.release(); }
});

app.delete('/api/bookings/:id', async (req,res) => {
  try { await db.query('DELETE FROM bookings WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ══════════════════════════════════════════
// DRIVERS
// ══════════════════════════════════════════
app.get('/api/drivers', async (req,res) => {
  try {
    const r = await db.query('SELECT db.*, v.plate_number AS default_plate FROM driver_balance db LEFT JOIN vehicles v ON v.id=db.default_vehicle_id ORDER BY driver_name');
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/drivers/list', async (req,res) => {
  try {
    const r = await db.query('SELECT id,name,phone,id_number,current_location,status,default_vehicle_id FROM drivers WHERE is_active=true ORDER BY name');
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/drivers/:id', async (req,res) => {
  try {
    const d = await db.query('SELECT * FROM drivers WHERE id=$1',[req.params.id]);
    const b = await db.query('SELECT * FROM driver_balance WHERE id=$1',[req.params.id]);
    const t = await db.query(`SELECT dt.*,m.movement_date,m.movement_time,m.movement_type,m.from_city,m.to_city,bk.group_name
      FROM driver_trips dt JOIN movements m ON m.id=dt.movement_id JOIN bookings bk ON bk.id=dt.booking_id
      WHERE dt.driver_id=$1 ORDER BY m.movement_date DESC`,[req.params.id]);
    const p = await db.query('SELECT * FROM driver_payments WHERE driver_id=$1 ORDER BY payment_date DESC',[req.params.id]);
    res.json({success:true,data:{...d.rows[0],balance:b.rows[0],trips:t.rows,payments:p.rows}});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/drivers', async (req,res) => {
  try {
    const {name,phone,nationality,id_number,id_expiry,license_number,license_expiry,default_vehicle_id,notes} = req.body;
    const r = await db.query(`INSERT INTO drivers(name,phone,nationality,id_number,id_expiry,license_number,license_expiry,default_vehicle_id,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name,phone,nationality,id_number,id_expiry||null,license_number,license_expiry||null,default_vehicle_id||null,notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.put('/api/drivers/:id', async (req,res) => {
  try {
    const {name,phone,nationality,id_number,id_expiry,license_number,license_expiry,default_vehicle_id,notes,current_location,status} = req.body;
    const r = await db.query(`UPDATE drivers SET name=$1,phone=$2,nationality=$3,id_number=$4,id_expiry=$5,
      license_number=$6,license_expiry=$7,default_vehicle_id=$8,notes=$9,current_location=COALESCE($10,current_location),status=COALESCE($11,status)
      WHERE id=$12 RETURNING *`,
      [name,phone,nationality,id_number,id_expiry||null,license_number,license_expiry||null,default_vehicle_id||null,notes,current_location,status,req.params.id]);
    res.json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.patch('/api/drivers/:id/location', async (req,res) => {
  try {
    const old = await db.query('SELECT current_location FROM drivers WHERE id=$1',[req.params.id]);
    await db.query('UPDATE drivers SET current_location=$1 WHERE id=$2',[req.body.location,req.params.id]);
    await db.query('INSERT INTO location_history(entity_type,entity_id,from_location,to_location,change_reason) VALUES($1,$2,$3,$4,$5)',
      ['driver',req.params.id,old.rows[0]?.current_location,req.body.location,'يدوي']);
    res.json({success:true});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/drivers/:id/trip', async (req,res) => {
  try {
    const {movement_id,booking_id,trip_amount,trip_notes} = req.body;
    const r = await db.query('INSERT INTO driver_trips(driver_id,movement_id,booking_id,trip_amount,trip_notes) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id,movement_id,booking_id,trip_amount,trip_notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/drivers/:id/payment', async (req,res) => {
  try {
    const {amount,payment_method,notes} = req.body;
    const r = await db.query('INSERT INTO driver_payments(driver_id,amount,payment_method,notes) VALUES($1,$2,$3,$4) RETURNING *',
      [req.params.id,amount,payment_method||'نقد',notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ══════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════
app.get('/api/vehicles', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM vehicles WHERE is_active=true ORDER BY plate_number');
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/vehicles', async (req,res) => {
  try {
    const {plate_number,vehicle_type,capacity,notes} = req.body;
    const r = await db.query('INSERT INTO vehicles(plate_number,vehicle_type,capacity,notes) VALUES($1,$2,$3,$4) RETURNING *',
      [plate_number,vehicle_type||'باص',capacity||45,notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.put('/api/vehicles/:id', async (req,res) => {
  try {
    const {plate_number,vehicle_type,capacity,current_location,status,notes} = req.body;
    const r = await db.query('UPDATE vehicles SET plate_number=$1,vehicle_type=$2,capacity=$3,current_location=$4,status=$5,notes=$6 WHERE id=$7 RETURNING *',
      [plate_number,vehicle_type,capacity,current_location,status,notes,req.params.id]);
    res.json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.patch('/api/vehicles/:id/location', async (req,res) => {
  try {
    await db.query('UPDATE vehicles SET current_location=$1 WHERE id=$2',[req.body.location,req.params.id]);
    res.json({success:true});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ══════════════════════════════════════════
// SUPPLIERS
// ══════════════════════════════════════════
app.get('/api/suppliers', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM supplier_balance ORDER BY supplier_name');
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/suppliers/list', async (req,res) => {
  try {
    const r = await db.query('SELECT id,name,phone,country FROM suppliers WHERE is_active=true ORDER BY name');
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/suppliers/:id', async (req,res) => {
  try {
    const s  = await db.query('SELECT * FROM suppliers WHERE id=$1',[req.params.id]);
    const b  = await db.query('SELECT * FROM supplier_balance WHERE id=$1',[req.params.id]);
    const d  = await db.query('SELECT * FROM external_drivers WHERE supplier_id=$1 AND is_active=true ORDER BY name',[req.params.id]);
    const t  = await db.query(`SELECT st.*,m.movement_date,m.movement_type,m.from_city,m.to_city,bk.group_name
      FROM supplier_trips st JOIN movements m ON m.id=st.movement_id JOIN bookings bk ON bk.id=st.booking_id
      WHERE st.supplier_id=$1 ORDER BY m.movement_date DESC`,[req.params.id]);
    const p  = await db.query('SELECT * FROM supplier_payments WHERE supplier_id=$1 ORDER BY payment_date DESC',[req.params.id]);
    res.json({success:true,data:{...s.rows[0],balance:b.rows[0],external_drivers:d.rows,trips:t.rows,payments:p.rows}});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/suppliers', async (req,res) => {
  try {
    const {name,phone,country,notes} = req.body;
    const r = await db.query('INSERT INTO suppliers(name,phone,country,notes) VALUES($1,$2,$3,$4) RETURNING *',[name,phone,country,notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.put('/api/suppliers/:id', async (req,res) => {
  try {
    const {name,phone,country,notes} = req.body;
    const r = await db.query('UPDATE suppliers SET name=$1,phone=$2,country=$3,notes=$4 WHERE id=$5 RETURNING *',[name,phone,country,notes,req.params.id]);
    res.json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.get('/api/suppliers/:id/drivers', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM external_drivers WHERE supplier_id=$1 AND is_active=true ORDER BY name',[req.params.id]);
    res.json({success:true,data:r.rows});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/suppliers/:id/drivers', async (req,res) => {
  try {
    const {name,phone,plate_number,vehicle_type,notes} = req.body;
    const r = await db.query('INSERT INTO external_drivers(supplier_id,name,phone,plate_number,vehicle_type,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id,name,phone,plate_number,vehicle_type||'باص',notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/suppliers/:id/trip', async (req,res) => {
  try {
    const {movement_id,booking_id,trip_amount,trip_notes} = req.body;
    const r = await db.query('INSERT INTO supplier_trips(supplier_id,movement_id,booking_id,trip_amount,trip_notes) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id,movement_id,booking_id,trip_amount,trip_notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

app.post('/api/suppliers/:id/payment', async (req,res) => {
  try {
    const {amount,payment_method,notes} = req.body;
    const r = await db.query('INSERT INTO supplier_payments(supplier_id,amount,payment_method,notes) VALUES($1,$2,$3,$4) RETURNING *',
      [req.params.id,amount,payment_method||'نقد',notes]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){ res.status(500).json({success:false,error:e.message}); }
});

// ══════════════════════════════════════════
// AGENTS (الوكلاء)
// ══════════════════════════════════════════
app.get('/api/agents', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agents WHERE is_active=true ORDER BY name');
    res.json({ success: true, data: r.rows });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM agents WHERE id=$1', [req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, phone, company, nationality, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'الاسم مطلوب' });
    const r = await db.query(
      'INSERT INTO agents(name,phone,company,nationality,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [name, phone, company, nationality, notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const { name, phone, company, nationality, notes } = req.body;
    const r = await db.query(
      'UPDATE agents SET name=$1,phone=$2,company=$3,nationality=$4,notes=$5 WHERE id=$6 RETURNING *',
      [name, phone, company, nationality, notes, req.params.id]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    await db.query('UPDATE agents SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ══════════════════════════════════════════
// AUTO ASSIGN (التوزيع التلقائي)
// ══════════════════════════════════════════
app.get('/api/auto-assign/suggestions', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'التاريخ مطلوب' });

    const unassigned = await db.query(`
      SELECT m.*, b.group_name, b.passenger_count
      FROM movements m
      JOIN bookings b ON b.id = m.booking_id
      WHERE m.movement_date = $1
        AND m.driver_id IS NULL
        AND m.supplier_id IS NULL
        AND m.status != 'ملغي'
      ORDER BY m.movement_time, m.sort_order
    `, [date]);

    if (!unassigned.rows.length) {
      return res.json({ success: true, data: [], message: 'كل الحركات لها سائق بالفعل' });
    }

    const drivers = await db.query(`
      SELECT d.*, v.plate_number, v.vehicle_type, v.capacity, v.id AS vid
      FROM drivers d
      LEFT JOIN vehicles v ON v.id = d.default_vehicle_id
      WHERE d.is_active = true AND d.status != 'خارج الخدمة'
      ORDER BY d.name
    `);

    const dayTrips = await db.query(`
      SELECT m.driver_id, COUNT(*) as trip_count,
             SUM(CASE WHEN (m.from_city IN ('مدينة','مكة') AND m.to_city IN ('مدينة','مكة') AND m.from_city != m.to_city)
                      OR (m.from_city IN ('جدة') AND m.to_city IN ('مدينة'))
                      OR (m.from_city IN ('مدينة') AND m.to_city IN ('جدة'))
                 THEN 1 ELSE 0 END) as long_count,
             SUM(CASE WHEN NOT ((m.from_city IN ('مدينة','مكة') AND m.to_city IN ('مدينة','مكة') AND m.from_city != m.to_city)
                      OR (m.from_city IN ('جدة') AND m.to_city IN ('مدينة'))
                      OR (m.from_city IN ('مدينة') AND m.to_city IN ('جدة')))
                 THEN 1 ELSE 0 END) as short_count,
             MAX(m.movement_time) as last_time,
             (SELECT m2.to_city FROM movements m2 WHERE m2.driver_id = m.driver_id AND m2.movement_date=$1 ORDER BY m2.movement_time DESC LIMIT 1) as last_location
      FROM movements m
      WHERE m.movement_date = $1 AND m.driver_id IS NOT NULL AND m.status != 'ملغي'
      GROUP BY m.driver_id
    `, [date]);

    const tripMap = {};
    dayTrips.rows.forEach(t => { tripMap[t.driver_id] = t; });

    const suggestions = [];
    const driverLoad = {};
    drivers.rows.forEach(d => {
      const existing = tripMap[d.id] || { trip_count:0, long_count:0, short_count:0, last_time:null, last_location:null };
      driverLoad[d.id] = {
        driver:       d,
        long_count:   parseInt(existing.long_count  || 0),
        short_count:  parseInt(existing.short_count || 0),
        last_time:    existing.last_time,
        last_location: existing.last_location || d.current_location,
      };
    });

    for (const movement of unassigned.rows) {
      const isLong = isLongRoute(movement.from_city, movement.to_city);
      let bestDriver = null;
      let bestScore  = -1;

      for (const d of drivers.rows) {
        const load = driverLoad[d.id];

        if (isLong && load.long_count >= 2)    continue;
        if (!isLong && load.short_count >= 3)   continue;
        if (load.long_count >= 2 && load.short_count >= 1) continue;
        if (load.long_count + load.short_count >= 3) continue;

        let score = 0;
        const driverLoc = load.last_location || d.current_location;
        if (driverLoc === movement.from_city) score += 50;
        else if (isNearby(driverLoc, movement.from_city)) score += 20;

        if (load.last_time) {
          const gap = timeGapMinutes(load.last_time, movement.movement_time);
          const needed = isLong ? 300 : 120;
          if (gap >= needed) score += 30;
          else if (gap >= needed / 2) score += 10;
          else continue;
        } else {
          score += 30;
        }

        score += (3 - load.long_count - load.short_count) * 5;

        if (score > bestScore) {
          bestScore  = score;
          bestDriver = d;
        }
      }

      suggestions.push({
        movement_id:   movement.id,
        movement_type: movement.movement_type,
        movement_date: movement.movement_date,
        movement_time: movement.movement_time,
        from_city:     movement.from_city,
        to_city:       movement.to_city,
        group_name:    movement.group_name,
        passenger_count: movement.passenger_count,
        is_long:       isLong,
        suggested_driver: bestDriver ? {
          id:           bestDriver.id,
          name:         bestDriver.name,
          phone:        bestDriver.phone,
          plate_number: bestDriver.plate_number,
          vehicle_id:   bestDriver.vid,
          current_location: driverLoad[bestDriver.id].last_location || bestDriver.current_location,
        } : null,
        score: bestScore,
      });

      if (bestDriver) {
        const load = driverLoad[bestDriver.id];
        if (isLong) load.long_count++;
        else        load.short_count++;
        load.last_time     = movement.movement_time;
        load.last_location = movement.to_city;
      }
    }

    res.json({ success: true, data: suggestions, date });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/auto-assign/apply', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { assignments } = req.body;
    let count = 0;
    for (const a of assignments) {
      if (!a.driver_id) continue;
      await client.query(
        'UPDATE movements SET driver_id=$1, vehicle_id=$2, driver_type=$3 WHERE id=$4',
        [a.driver_id, a.vehicle_id || null, 'internal', a.movement_id]
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ success: true, applied: count });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally { client.release(); }
});

// ── دوال مساعدة للتوزيع التلقائي ──
function isLongRoute(from, to) {
  const longPairs = [
    ['مكة','مدينة'],['مدينة','مكة'],
    ['جدة','مدينة'],['مدينة','جدة'],
  ];
  return longPairs.some(([a,b]) => from===a && to===b);
}

function isNearby(loc1, loc2) {
  const near = { 'جدة':['مكة'], 'مكة':['جدة'], 'مدينة':['مطار-مدينة'], 'مطار-مدينة':['مدينة'], 'مطار-جدة':['جدة'] };
  return (near[loc1]||[]).includes(loc2);
}

function timeGapMinutes(t1, t2) {
  const toMin = t => { const [h,m]=(t||'00:00').slice(0,5).split(':'); return parseInt(h)*60+parseInt(m); };
  return toMin(t2) - toMin(t1);
}

// Health
app.get('/api/health', (_,res) => res.json({success:true,message:'✅ API يعمل',time:new Date()}));
app.use((_,res) => res.status(404).json({success:false,error:'المسار غير موجود'}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚌 API على المنفذ ${PORT}`));
