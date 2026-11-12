try { process.loadEnvFile(require('path').join(__dirname, '.env')); } catch {}
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function populateDB() {
  const client = await pool.connect();
  try {
    console.log('Connecting to Neon PostgreSQL...');
    await client.query('BEGIN');

    // 1. Get existing services or insert if needed
    const servRes = await client.query('SELECT service_id, service_code, title, price_inr FROM services;');
    let services = servRes.rows;
    if (services.length === 0) {
      console.log('Inserting default services into Neon DB...');
      await client.query(`
        INSERT INTO services (service_code, title, price_inr, duration_minutes, sessions_count, target_rider_level, description, brochure_page)
        VALUES
        ('basic_course', 'Basic Horse Riding Course', 15000.00, 30, 15, 'Beginner', 'Foundational horse riding course covering grooming, mounting, posture, balance, trot, and lead control. Minimum 40 days recommended completion window.', 4),
        ('beginner_session', 'One-Hour Session for Beginner', 1500.00, 60, 1, 'Beginner', 'Two-stage introductory ride: 30 mins riding first horse, followed by a rest/changeover break, and 30 mins on a secondary mount with certified instructor.', 5),
        ('experienced_session', 'One-Hour Session for Experienced Riders', 2000.00, 60, 1, 'Experienced', 'Dedicated one-hour practice session across two horses to understand different rhythms, responses, and personalities.', 6),
        ('jumping_training', 'Jumping Training', 3000.00, 45, 1, 'Experienced', 'Advanced show jumping in our 120ft x 80ft sand arena with cross-rail poles and obstacle courses.', 7),
        ('trail_ride', 'Scenic Gorai Trail Ride', 1500.00, 45, 1, 'Experienced', 'Scenic 3 km outdoor countryside trail through Gorai coastal foliage and palms.', 8),
        ('come_close', 'Come Close to a Horse', 600.00, 90, 1, 'Family', 'Holistic equine bonding experience. Brushing, horse care education, stable tour, approx 15m ride, tea & snacks. Min 5 persons.', 9)
        ON CONFLICT (service_code) DO NOTHING;
      `);
      const sReload = await client.query('SELECT service_id, service_code, title, price_inr FROM services;');
      services = sReload.rows;
    }
    console.log(`Loaded ${services.length} services from DB.`);

    const sBasic = services.find(s => s.service_code === 'basic_course') || services[0];
    const sBeginner = services.find(s => s.service_code === 'beginner_session') || services[1] || services[0];
    const sExp = services.find(s => s.service_code === 'experienced_session') || services[2] || services[0];
    const sJump = services.find(s => s.service_code === 'jumping_training') || services[3] || services[0];
    const sTrail = services.find(s => s.service_code === 'trail_ride') || services[4] || services[0];
    const sClose = services.find(s => s.service_code === 'come_close') || services[5] || services[0];

    // 2. Customers
    const customersData = [
      { name: 'Aarav Sharma', phone: '+919820112345', lang: 'en' },
      { name: 'Pooja Hegde', phone: '+919167389211', lang: 'en' },
      { name: 'Dr. Natasha Roy', phone: '+919819966014', lang: 'en' },
      { name: 'Aditya Mehta', phone: '+919820577123', lang: 'hi' },
      { name: 'Sneha Kulkarni', phone: '+919833455678', lang: 'mr' },
      { name: 'Vikramaditya Singhania', phone: '+919920888990', lang: 'en' },
      { name: 'Manish Kothari', phone: '+919833022199', lang: 'en' },
      { name: 'Ananya Deshmukh', phone: '+919769012389', lang: 'en' }
    ];

    const customerMap = {};
    for (const c of customersData) {
      const q = await client.query(
        `INSERT INTO customers (whatsapp_number, full_name, preferred_language)
         VALUES ($1, $2, $3)
         ON CONFLICT (whatsapp_number) DO UPDATE
         SET full_name = EXCLUDED.full_name, preferred_language = EXCLUDED.preferred_language, updated_at = CURRENT_TIMESTAMP
         RETURNING customer_id, full_name, whatsapp_number;`,
        [c.phone, c.name, c.lang]
      );
      customerMap[c.phone] = q.rows[0];
    }
    console.log(`Upserted ${Object.keys(customerMap).length} customers in DB.`);

    // 3. Conversations & Messages
    const convData = [
      {
        phone: '+919820577123',
        sessionId: 'sess-wa-mehta-001',
        state: 'HUMAN_HANDOVER',
        mode: 'HUMAN_HANDOVER',
        intent: 'group_booking',
        lang: 'hi',
        messages: [
          { sender: 'user', direction: 'INBOUND', text: 'Namaste! Hamare corporate group me 14 log hain. Sunset trail ride aur high tea ka kya package hoga?', timeOffset: 50 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'नमस्ते आदित्य जी! 🐎 GEC में आपका स्वागत है। 14 लोगों के लिए हमारा "Come Close to a Horse" और Coastal Trail Ride एक साथ बुक किया जा सकता है।', timeOffset: 48 },
          { sender: 'user', direction: 'INBOUND', text: 'Can we get private arena booking from 4 PM to 7 PM this Saturday with custom snacks?', timeOffset: 25 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'Connecting you with our senior equestrian coordinator for custom slot booking. One moment please!', timeOffset: 24 },
          { sender: 'admin_staff', direction: 'OUTBOUND', text: 'Hello Aditya! This is Mandar from GEC. Saturday 4:30 PM is open for private booking. Would you like a WhatsApp invoice sent to this number?', timeOffset: 10 }
        ]
      },
      {
        phone: '+919820112345',
        sessionId: 'sess-wa-aarav-002',
        state: 'HUMAN_HANDOVER',
        mode: 'HUMAN_HANDOVER',
        intent: 'safety_inquiry',
        lang: 'en',
        messages: [
          { sender: 'user', direction: 'INBOUND', text: 'Hello! I want to enroll my 9-year-old son in the 15-session Basic Course. Does an instructor walk alongside him?', timeOffset: 90 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'Welcome to GEC! 🐎 Yes, safety is our top priority. Beginners are led on a lunge line by certified trainers with CE-certified riding helmets provided on-site.', timeOffset: 89 },
          { sender: 'user', direction: 'INBOUND', text: 'Could a staff member please confirm if Saturday 8:00 AM batch has open slots?', timeOffset: 15 }
        ]
      },
      {
        phone: '+919167389211',
        sessionId: 'sess-wa-pooja-003',
        state: 'PAYMENT_SUCCESS',
        mode: 'AI_HANDLED',
        intent: 'payment_confirmation',
        lang: 'en',
        messages: [
          { sender: 'user', direction: 'INBOUND', text: 'Hi! Just completed the registration form and paid for Basic Course.', timeOffset: 180 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'Congratulations Pooja! 🎉 Payment of ₹15,000 received (Receipt GEC-REC-2026-0001). Your signed indemnity and medical fitness declarations are verified in our system.', timeOffset: 178 },
          { sender: 'user', direction: 'INBOUND', text: 'Thank you! Excited for my first session this Sunday morning!', timeOffset: 120 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'See you at Khajuriwadi, Gorai! Please wear closed-toe riding boots or sturdy shoes and stretchable jeans. 🐎', timeOffset: 119 }
        ]
      },
      {
        phone: '+919819966014',
        sessionId: 'sess-wa-natasha-004',
        state: 'PAYMENT_SUCCESS',
        mode: 'AI_HANDLED',
        intent: 'jumping_session',
        lang: 'en',
        messages: [
          { sender: 'user', direction: 'INBOUND', text: 'Good morning! Is the 120ft x 80ft sand arena available for show jumping practice tomorrow at 7 AM?', timeOffset: 300 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'Hello Dr. Natasha! Yes, our sand arena is prepared with cross-rail poles. One session is ₹3,000 for 45 minutes.', timeOffset: 298 },
          { sender: 'user', direction: 'INBOUND', text: 'Booking and paying now through checkout webview.', timeOffset: 250 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'Confirmed! Receipt GEC-REC-2026-0002 generated. Our equine master trainer will be ready with mount "Thunder". 🏇', timeOffset: 240 }
        ]
      },
      {
        phone: '+919833455678',
        sessionId: 'sess-wa-sneha-005',
        state: 'SERVICE_DISCOVERY',
        mode: 'AI_HANDLED',
        intent: 'trail_ride_inquiry',
        lang: 'mr',
        messages: [
          { sender: 'user', direction: 'INBOUND', text: 'नमस्कार! गोराई बीच जवळ 3 किमी ची आउटडोर ट्रेल राइड उपलब्ध आहे का?', timeOffset: 400 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'नमस्कार स्नेहा जी! 🐎 होय, गोराईची नयनरम्य ३ किमी निसर्गरम्य ट्रेल राइड दररोज उपलब्ध आहे. शुल्क ₹1,500 (45 मिनिटे).', timeOffset: 395 },
          { sender: 'user', direction: 'INBOUND', text: 'आम्ही २ जण येत आहोत, कृपया नोंदणी लिंक पाठवा.', timeOffset: 350 },
          { sender: 'bot', direction: 'OUTBOUND', text: 'नक्कीच! येथे तुमची नोंदणी लिंक आहे: https://goraiequestriancentre.vercel.app/register', timeOffset: 348 }
        ]
      }
    ];

    for (const cv of convData) {
      const cust = customerMap[cv.phone];
      if (!cust) continue;

      const cRes = await client.query(
        `INSERT INTO conversations (customer_id, session_id, current_state, control_mode, current_intent, language, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (session_id) DO UPDATE
         SET current_state = EXCLUDED.current_state, control_mode = EXCLUDED.control_mode, language = EXCLUDED.language, updated_at = CURRENT_TIMESTAMP
         RETURNING conversation_id;`,
        [cust.customer_id, cv.sessionId, cv.state, cv.mode, cv.intent, cv.lang]
      );
      const convId = cRes.rows[0].conversation_id;

      // Delete existing messages for this conversation to prevent duplicate spam on re-run
      await client.query('DELETE FROM messages WHERE conversation_id = $1;', [convId]);

      for (const m of cv.messages) {
        await client.query(
          `INSERT INTO messages (conversation_id, customer_id, direction, content, sender, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP - ($6 || ' minutes')::INTERVAL);`,
          [convId, cust.customer_id, m.direction, m.text, m.sender, m.timeOffset]
        );
      }
    }
    console.log('Seeded conversations and message history into Neon DB.');

    // 4. Registrations & Consents
    const regsData = [
      {
        phone: '+919167389211',
        activity: 'Riding Lessons',
        level: 'Beginner',
        name: 'Pooja Hegde',
        address: 'Flat 12, Ocean Crest, Gorai Road, Mumbai - 400092',
        email: 'pooja.hegde@example.com',
        occupation: 'Software Engineer',
        dob: '1995-11-20',
        height: 165,
        weight: 58,
        blood: 'O+',
        ecPerson: 'Ramesh Hegde (Father)',
        ecPhone: '+919167389200',
        physician: 'Dr. S. Nadkarni (+91 98200 44112)',
        isMinor: false,
        guardian: null,
        sigName: 'Pooja Hegde'
      },
      {
        phone: '+919819966014',
        activity: 'Jumping Lessons',
        level: 'Advanced',
        name: 'Dr. Natasha Roy',
        address: '18 Sea Pearl, Bandra West, Mumbai - 400050',
        email: 'natasha.roy@hospital.org',
        occupation: 'Surgeon',
        dob: '1985-03-22',
        height: 170,
        weight: 62,
        blood: 'A+',
        ecPerson: 'Vikram Roy (Brother)',
        ecPhone: '+919819966000',
        physician: 'Self / Lilavati Hospital',
        isMinor: false,
        guardian: null,
        sigName: 'Dr. Natasha Roy'
      },
      {
        phone: '+919833455678',
        activity: 'Trail Ride',
        level: 'Intermediate',
        name: 'Sneha Kulkarni',
        address: 'A-301 Green Acres, Thane West - 400601',
        email: 'sneha.kulkarni@tech.in',
        occupation: 'Product Designer',
        dob: '1993-08-14',
        height: 162,
        weight: 54,
        blood: 'B+',
        ecPerson: 'Amit Kulkarni (Spouse)',
        ecPhone: '+919833455670',
        physician: 'Dr. Deshpande Clinic',
        isMinor: false,
        guardian: null,
        sigName: 'Sneha Kulkarni'
      },
      {
        phone: '+919833022199',
        activity: 'Riding Lessons',
        level: 'Beginner',
        name: 'Aanya Kothari',
        address: '704 Silver Arch, Kandivali West, Mumbai - 400067',
        email: 'manish.kothari@gmail.com',
        occupation: 'Student (Grade 4)',
        dob: '2016-08-10',
        height: 135,
        weight: 32,
        blood: 'O+',
        ecPerson: 'Manish Kothari (Father)',
        ecPhone: '+919833022199',
        physician: 'Dr. Joshi Child Clinic',
        isMinor: true,
        guardian: 'Manish Kothari',
        sigName: 'Manish Kothari (for Aanya)'
      },
      {
        phone: '+919920888990',
        activity: 'Riding Lessons',
        level: 'Intermediate',
        name: 'Vikramaditya Singhania',
        address: 'Penthouse 4, Worli Sea Face, Mumbai - 400018',
        email: 'v.singhania@holding.co',
        occupation: 'Managing Director',
        dob: '1982-12-05',
        height: 182,
        weight: 78,
        blood: 'AB+',
        ecPerson: 'Meera Singhania',
        ecPhone: '+919920888995',
        physician: 'Dr. B. Mehta',
        isMinor: false,
        guardian: null,
        sigName: 'Vikramaditya Singhania'
      }
    ];

    const regMap = {};
    for (const r of regsData) {
      const cust = customerMap[r.phone];
      if (!cust) continue;

      const rRes = await client.query(
        `INSERT INTO registrations (
          customer_id, activity, rider_level, full_name, address, mobile_number, email,
          occupation, date_of_birth, height_cm, weight_kg, blood_group,
          emergency_contact_person, emergency_contact_number, family_physician,
          is_minor, guardian_name, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'COMPLETED')
        RETURNING registration_id;`,
        [
          cust.customer_id, r.activity, r.level, r.name, r.address, r.phone, r.email,
          r.occupation, r.dob, r.height, r.weight, r.blood,
          r.ecPerson, r.ecPhone, r.physician, r.isMinor, r.guardian
        ]
      );
      const regId = rRes.rows[0].registration_id;
      regMap[r.phone] = regId;

      await client.query(
        `INSERT INTO consents (
          registration_id, customer_id, medical_fitness_confirmed, safety_rules_acknowledged,
          indemnity_accepted, media_consent_granted, digital_signature_name, digital_signature_date
        )
        VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, $3, CURRENT_DATE);`,
        [regId, cust.customer_id, r.sigName]
      );
    }
    console.log(`Seeded ${Object.keys(regMap).length} rider registrations & consents in Neon DB.`);

    // 5. Selected Services & Payments
    const payData = [
      {
        phone: '+919167389211',
        service: sBasic,
        count: 1,
        total: 15000.00,
        status: 'PAID',
        gateway: 'Razorpay UPI',
        gatewayId: 'pay_Rzp_Pooja_9921',
        receipt: 'GEC-REC-2026-0001'
      },
      {
        phone: '+919819966014',
        service: sJump,
        count: 1,
        total: 3000.00,
        status: 'PAID',
        gateway: 'Razorpay Card',
        gatewayId: 'pay_Rzp_Natasha_8832',
        receipt: 'GEC-REC-2026-0002'
      },
      {
        phone: '+919833022199',
        service: sClose,
        count: 5,
        total: 3000.00,
        status: 'PAID',
        gateway: 'UPI QR PhonePe',
        gatewayId: 'upi_phonepe_kothari_5512',
        receipt: 'GEC-REC-2026-0003'
      },
      {
        phone: '+919833455678',
        service: sTrail,
        count: 2,
        total: 3000.00,
        status: 'PAID',
        gateway: 'Razorpay NetBanking',
        gatewayId: 'pay_Rzp_Sneha_4421',
        receipt: 'GEC-REC-2026-0004'
      },
      {
        phone: '+919920888990',
        service: sExp,
        count: 1,
        total: 2000.00,
        status: 'PAID',
        gateway: 'Razorpay Corporate Card',
        gatewayId: 'pay_Rzp_Singhania_1120',
        receipt: 'GEC-REC-2026-0005'
      },
      {
        phone: '+919820112345',
        service: sBeginner,
        count: 1,
        total: 1500.00,
        status: 'PENDING',
        gateway: 'Payment Link Sent',
        gatewayId: 'link_pending_aarav_99',
        receipt: 'GEC-REC-2026-0006'
      }
    ];

    for (const p of payData) {
      const cust = customerMap[p.phone];
      if (!cust) continue;

      const regId = regMap[p.phone] || null;
      const oRes = await client.query(
        `INSERT INTO selected_services (customer_id, registration_id, service_id, service_code, service_title, participants_count, unit_price_inr, total_amount_inr)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING order_id;`,
        [cust.customer_id, regId, p.service.service_id, p.service.service_code, p.service.title, p.count, p.service.price_inr, p.total]
      );
      const orderId = oRes.rows[0].order_id;

      await client.query(
        `INSERT INTO payments (
          order_id, customer_id, amount_inr, currency, payment_status, payment_gateway, gateway_payment_id, receipt_number, paid_at
        )
        VALUES ($1, $2, $3, 'INR', $4::payment_status_type, $5, $6, $7, CASE WHEN $4 = 'PAID' THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (receipt_number) DO UPDATE
        SET amount_inr = EXCLUDED.amount_inr, payment_status = EXCLUDED.payment_status, updated_at = CURRENT_TIMESTAMP;`,
        [orderId, cust.customer_id, p.total, p.status, p.gateway, p.gatewayId, p.receipt]
      );
    }
    console.log(`Seeded ${payData.length} verified orders and payments in Neon DB.`);

    // 6. Knowledge Base Articles
    const kbItems = [
      {
        cat: 'Announcements',
        title: 'Morning Golden Hour Batches (6:30 AM – 9:30 AM)',
        content: 'During peak coastal weather in Gorai, our prime riding slots are between 6:30 AM and 9:30 AM to give horses optimal temperature and riders soft morning coastal breeze. Advanced slot booking via WhatsApp is mandatory.'
      },
      {
        cat: 'Safety',
        title: 'Mandatory Attire & Safety Gear Protocols',
        content: 'All riders must wear CE/ASTM certified equestrian helmets provided by GEC. Closed-toe boots or shoes with small heel, full-length denim or riding breeches are compulsory. Loose jewelry and flapping clothing are strictly prohibited.'
      },
      {
        cat: 'Facilities',
        title: 'Arena Specifications & Trail Routes',
        content: 'GEC features a fenced 120ft x 80ft sand arena with shock-absorbing sand footing, an open grooming paddock, and direct access to a 3 km shaded Gorai coastal trail route through Khajuriwadi.'
      },
      {
        cat: 'FAQs',
        title: 'What is the policy for rainy days and rescheduling?',
        content: 'Sessions are paused during heavy waterlogged rain for horse hooves and arena safety. All pre-paid sessions are automatically rescheduled without any cancellation fees or forfeitures.'
      },
      {
        cat: 'Pricing',
        title: 'Official Group & Family Discounts Policy',
        content: 'Come Close to a Horse is ₹600/person for minimum 5 individuals (includes care, 15m ride, tea & snacks). Individual single-hour rides are locked at ₹1,500 (Beginner) and ₹2,000 (Experienced).'
      }
    ];

    for (const k of kbItems) {
      await client.query(
        `INSERT INTO knowledge_base (category, title, content, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT DO NOTHING;`,
        [k.cat, k.title, k.content]
      );
    }
    console.log('Seeded knowledge base articles in Neon DB.');

    // 7. Visual Assets
    const visualItems = [
      {
        key: 'arena_riding',
        title: 'Professional Sand Arena (120ft x 80ft)',
        page: 3,
        url: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=800&q=80',
        caption: 'Our well-maintained 120ft x 80ft training arena designed for beginner balance, canter, and jumping.'
      },
      {
        key: 'trail_coastal',
        title: 'Scenic 3km Coastal Trail Ride',
        page: 8,
        url: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?auto=format&fit=crop&w=800&q=80',
        caption: 'Take a tranquil ride through Gorai natural trails under the cool canopy of palm trees.'
      },
      {
        key: 'come_close',
        title: 'Equine Bonding & Grooming Paddock',
        page: 9,
        url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
        caption: 'Gentle interaction, brushing, and joyful horse feeding for kids, families, and newcomers.'
      },
      {
        key: 'jumping_hurdles',
        title: 'Show Jumping & Obstacle Course',
        page: 7,
        url: 'https://images.unsplash.com/photo-1534073828943-f801091bb18c?auto=format&fit=crop&w=800&q=80',
        caption: 'Cross-rail poles and elevated hurdles for intermediate to advanced riders seeking jumping mastery.'
      }
    ];

    for (const v of visualItems) {
      await client.query(
        `INSERT INTO visual_assets (topic_key, title, brochure_source_page, image_url, caption_en)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING;`,
        [v.key, v.title, v.page, v.url, v.caption]
      );
    }
    console.log('Seeded visual assets in Neon DB.');

    await client.query('COMMIT');
    console.log('SUCCESS! All data committed to Neon PostgreSQL database.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database population failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

populateDB().catch(() => process.exit(1));
