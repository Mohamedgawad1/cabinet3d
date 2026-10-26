/* ------------------------------------------------------------------------
   CAB3D device library
   Real assembled models for every equipment family in the cable schedule.
   Each builder adds meshes to the group with the base at y = 0 and the
   footprint centred on the origin, matching KIND_SHAPE (units = 10 mm).

   builder(P) where P = { g, shape, tint, desc, tag, ref, bad }
   ------------------------------------------------------------------------ */
(function () {
  const T = THREE;

  /* ---------- materials ---------- */
  const MATC = {
    steel:    0x9fb2c0,
    darkSteel: 0x39495a,
    body:     0x4a5a68,
    dark:     0x1d2a35,
    black:    0x101820,
    pipe:     0x8b9eab,
    glass:    0x0d1c26,
    brass:    0xc9a227,
    white:    0xe6eef4
  };

  function M(color, o) {
    return new T.MeshStandardMaterial(Object.assign({
      color: color, metalness: 0.62, roughness: 0.42
    }, o || {}));
  }
  const steelM   = () => M(MATC.steel, { metalness: 0.92, roughness: 0.26 });
  const darkM    = () => M(MATC.dark, { metalness: 0.55, roughness: 0.55 });
  const pipeM    = () => M(MATC.pipe, { metalness: 0.88, roughness: 0.34 });
  const accentM  = c => M(c, { metalness: 0.5, roughness: 0.35, emissive: c, emissiveIntensity: 0.22 });
  const glowM    = (c, i) => new T.MeshStandardMaterial({ color: 0x08131a, emissive: c, emissiveIntensity: i || 2, metalness: 0.2, roughness: 0.4 });
  const glassM   = () => M(MATC.glass, { metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.62 });

  /* ---------- primitives ---------- */
  function box(g, w, h, d, x, y, z, m, rot) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(mesh);
    return mesh;
  }
  function cyl(g, rTop, rBot, h, x, y, z, m, axis, seg) {
    const mesh = new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, seg || 18), m);
    mesh.position.set(x, y, z);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    g.add(mesh);
    return mesh;
  }
  function sph(g, r, x, y, z, m, sx, sy, sz) {
    const mesh = new T.Mesh(new T.SphereGeometry(r, 20, 14), m);
    mesh.position.set(x, y, z);
    if (sx || sy || sz) mesh.scale.set(sx || 1, sy || 1, sz || 1);
    g.add(mesh);
    return mesh;
  }
  function torus(g, R, tube, x, y, z, m, rot, seg) {
    const mesh = new T.Mesh(new T.TorusGeometry(R, tube, 10, seg || 20), m);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(mesh);
    return mesh;
  }
  /* flange = short fat disc with bolt heads */
  function flange(g, r, x, y, z, m, axis, bolts) {
    cyl(g, r, r, r * 0.32, x, y, z, m, axis, 20);
    if (bolts === false) return;
    const n = 8, rr = r * 0.78;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bx = axis === 'x' ? x : x + Math.cos(a) * rr;
      const bz = axis === 'x' ? z + Math.sin(a) * rr : z;
      const by = axis === 'x' ? y + Math.sin(a) * rr : y;
      cyl(g, r * 0.1, r * 0.1, r * 0.42, bx, by, bz, steelM(),
          axis === 'x' ? 'x' : (axis === 'z' ? 'z' : 'y'), 6);
    }
  }
  function handwheel(g, R, x, y, z, m, rot) {
    torus(g, R, R * 0.11, x, y, z, m, rot || [Math.PI / 2, 0, 0], 22);
    if (!rot || Math.abs(rot[0]) < 0.01) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        box(g, R * 1.9, R * 0.07, R * 0.07, x, y + Math.sin(a) * 0, z, m, [0, 0, a]);
      }
    }
    cyl(g, R * 0.22, R * 0.22, R * 0.34, x, y, z, m, 'y', 12);
  }

  /* =======================================================================
     VALVES — body + flanges + bonnet + operator (handwheel / MOV / pneumatic)
     ======================================================================= */
  function buildValve(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const y = shape.y;
    const L = shape.sx * 1.15;            // face-to-face
    const rp = shape.sy * 0.20;           // pipe radius
    const acc = accentM(tint);

    /* pipe stubs + weld flanges on both sides */
    [-1, 1].forEach(s => {
      cyl(g, rp, rp, L * 0.30, s * (L * 0.36), y, 0, pipeM(), 'x', 16);
      flange(g, rp * 1.95, s * (L * 0.485), y, 0, steelM(), 'x');
    });

    /* body: ball → sphere, butterfly → thin disc housing, others → globe */
    if (/BALL/.test(d)) {
      sph(g, shape.sy * 0.34, 0, y, 0, acc, 1.0, 1.0, 1.0);
    } else if (/BUTTERFLY/.test(d)) {
      cyl(g, shape.sy * 0.34, shape.sy * 0.34, L * 0.26, 0, y, 0, acc, 'x', 20);
      flange(g, shape.sy * 0.40, -L * 0.13, y, 0, steelM(), 'x', false);
      flange(g, shape.sy * 0.40, L * 0.13, y, 0, steelM(), 'x', false);
    } else {
      /* globe body: sphere squashed along the pipe + two conical necks */
      sph(g, shape.sy * 0.33, 0, y, 0, acc, 1.25, 1.0, 1.0);
      cyl(g, rp * 1.35, rp * 1.05, L * 0.22, -L * 0.19, y, 0, acc, 'x', 16);
      cyl(g, rp * 1.05, rp * 1.35, L * 0.22, L * 0.19, y, 0, acc, 'x', 16);
    }

    /* bonnet + stem */
    const neckTop = y + shape.sy * 0.52;
    cyl(g, rp * 1.15, rp * 1.5, shape.sy * 0.30, 0, y + shape.sy * 0.30, 0, acc, 'y', 16);
    flange(g, rp * 1.45, 0, neckTop, 0, steelM(), 'y', false);
    cyl(g, rp * 0.34, rp * 0.34, shape.sy * 0.34, 0, neckTop + shape.sy * 0.16, 0, steelM(), 'y', 12);

    if (/MOTOR OPERATED|\bMOV\b|ELECTRIC ACTUATOR/.test(d)) {
      /* --- motor operated valve: actuator housing, cooling fins, handwheel, cable gland */
      const ay = neckTop + shape.sy * 0.30;
      box(g, shape.sy * 0.62, shape.sy * 0.52, shape.sy * 0.52, 0, ay, 0, M(MATC.darkSteel, { metalness: 0.6, roughness: 0.4 }));
      for (let i = 0; i < 5; i++)                       // cooling fins
        box(g, shape.sy * 0.66, shape.sy * 0.045, shape.sy * 0.58, 0, ay - shape.sy * 0.20 + i * shape.sy * 0.105, 0, steelM());
      box(g, shape.sy * 0.30, shape.sy * 0.26, shape.sy * 0.10, 0, ay, shape.sy * 0.30, glowM(tint, 1.1));  // position indicator
      cyl(g, shape.sy * 0.30, shape.sy * 0.30, shape.sy * 0.08, 0, ay + shape.sy * 0.29, 0, steelM(), 'y', 16);
      handwheel(g, shape.sy * 0.26, 0, ay + shape.sy * 0.36, 0, accentM(tint), [Math.PI / 2, 0, 0]);          // declutch handwheel
      cyl(g, shape.sy * 0.11, shape.sy * 0.11, shape.sy * 0.20, shape.sy * 0.30, ay - shape.sy * 0.05, 0, steelM(), 'x', 10); // cable entry
      box(g, shape.sy * 0.20, shape.sy * 0.20, shape.sy * 0.16, shape.sy * 0.44, ay - shape.sy * 0.05, 0, darkM());          // terminal box
    } else if (/CONTROL|REGULAT|FLOW CONTROL/.test(d)) {
      /* --- pneumatic diaphragm actuator with positioner --- */
      const ay = neckTop + shape.sy * 0.34;
      [-1, 1].forEach(s => box(g, shape.sy * 0.09, shape.sy * 0.40, shape.sy * 0.09, s * shape.sy * 0.30, ay - shape.sy * 0.24, 0, steelM()));
      cyl(g, shape.sy * 0.44, shape.sy * 0.44, shape.sy * 0.30, 0, ay, 0, M(MATC.darkSteel, { roughness: 0.5 }), 'y', 22);
      sph(g, shape.sy * 0.44, 0, ay + shape.sy * 0.15, 0, accentM(tint), 1, 0.55, 1);   // diaphragm cap
      cyl(g, shape.sy * 0.05, shape.sy * 0.05, shape.sy * 0.22, 0, ay + shape.sy * 0.36, 0, steelM(), 'y', 8); // spring adjuster
      box(g, shape.sy * 0.26, shape.sy * 0.34, shape.sy * 0.20, shape.sy * 0.42, ay - shape.sy * 0.06, 0, darkM()); // positioner
      cyl(g, shape.sy * 0.045, shape.sy * 0.045, shape.sy * 0.42, shape.sy * 0.30, ay - shape.sy * 0.06, 0, steelM(), 'x', 8); // air tubing
      cyl(g, shape.sy * 0.07, shape.sy * 0.07, shape.sy * 0.14, shape.sy * 0.56, ay - shape.sy * 0.06, 0, accentM(tint), 'x', 10);
    } else {
      /* --- manual handwheel --- */
      handwheel(g, shape.sy * 0.42, 0, neckTop + shape.sy * 0.34, 0, accentM(tint), [Math.PI / 2, 0, 0]);
      cyl(g, shape.sy * 0.07, shape.sy * 0.07, shape.sy * 0.18, 0, neckTop + shape.sy * 0.16, 0, steelM(), 'y', 8);
    }

    /* tag plate */
    box(g, shape.sx * 0.16, shape.sy * 0.10, 0.12, shape.sx * 0.22, y - shape.sy * 0.28, shape.sz * 0.16, M(MATC.white, { metalness: 0.2, roughness: 0.6 }));
  }

  /* =======================================================================
     SKID / PACKAGE — structural frame, vessel, header, valves, control panel
     ======================================================================= */
  function buildSkid(P) {
    const { g, shape, tint } = P;
    const sx = shape.sx, sz = shape.sz, y0 = 0;
    const acc = accentM(tint);

    /* two skid beams + cross members */
    [-1, 1].forEach(s => box(g, sx, 0.9, 1.1, 0, 0.45, s * (sz / 2 - 0.9), steelM()));
    [-1, 1].forEach(s => box(g, 1.1, 0.8, sz, s * (sx / 2 - 0.9), 0.45, 0, steelM()));
    box(g, sx * 0.98, 0.35, 0.7, 0, 1.1, 0, steelM());

    /* four posts + deck */
    const deckY = shape.sy * 0.30;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) =>
      box(g, 0.7, deckY, 0.7, a * (sx / 2 - 1.2), deckY / 2 + 0.9, b * (sz / 2 - 1.2), steelM()));
    box(g, sx * 0.94, 0.45, sz * 0.92, 0, deckY + 1.1, 0, M(MATC.darkSteel, { metalness: 0.7, roughness: 0.5 }));

    /* horizontal vessel on two saddles (the package's main item) */
    const vy = deckY + shape.sy * 0.34;
    const vr = sz * 0.19, vl = sx * 0.46;
    cyl(g, vr, vr, vl, 0, vy, -sz * 0.16, M(MATC.pipe, { metalness: 0.8, roughness: 0.3 }), 'x', 22);
    sph(g, vr, -vl / 2, vy, -sz * 0.16, pipeM(), 1, 1, 1);
    sph(g, vr, vl / 2, vy, -sz * 0.16, pipeM(), 1, 1, 1);
    [-1, 1].forEach(s => box(g, 1.2, vy - deckY - 1.2, vr * 1.5, s * vl * 0.28, deckY + 1.5 + (vy - deckY - 1.2) / 2, -sz * 0.16, steelM()));
    /* vessel nozzles + gauges */
    cyl(g, vr * 0.22, vr * 0.22, shape.sy * 0.22, -vl * 0.2, vy + vr + shape.sy * 0.09, -sz * 0.16, pipeM(), 'y', 12);
    cyl(g, vr * 0.22, vr * 0.22, shape.sy * 0.22, vl * 0.2, vy + vr + shape.sy * 0.09, -sz * 0.16, pipeM(), 'y', 12);
    sph(g, 1.0, -vl * 0.2, vy + vr + shape.sy * 0.24, -sz * 0.16, M(MATC.white, { metalness: 0.3, roughness: 0.5 }));
    sph(g, 1.0, vl * 0.2, vy + vr + shape.sy * 0.24, -sz * 0.16, M(MATC.white, { metalness: 0.3, roughness: 0.5 }));

    /* pipe header along the front edge + three small valves + elbows */
    const hy = deckY + 2.4, hz = sz * 0.30;
    cyl(g, 0.62, 0.62, sx * 0.8, 0, hy, hz, pipeM(), 'x', 14);
    [-1, 1].forEach(s => {
      cyl(g, 0.62, 0.62, 2.6, s * sx * 0.40, hy, hz, pipeM(), 'y', 14);
      torus(g, 0.62, 0.62, s * sx * 0.40, hy + 1.3, hz, pipeM(), [Math.PI / 2, 0, 0], 14);
      flange(g, 1.1, s * sx * 0.40, hy + 2.6, hz, steelM(), 'y', false);
    });
    for (let i = -1; i <= 1; i++) {
      const vx = i * sx * 0.19;
      sph(g, 1.15, vx, hy, hz, accentM(tint), 1.15, 1, 1);
      cyl(g, 0.5, 0.5, 1.7, vx, hy + 1.5, hz, acc, 'y', 10);
      torus(g, 1.35, 0.16, vx, hy + 2.5, hz, acc, [Math.PI / 2, 0, 0], 16);
      cyl(g, 0.16, 0.16, 1.2, vx, hy + 3.1, hz, steelM(), 'y', 8);
    }

    /* local control panel at one end + its JB + conduit */
    const px = -sx * 0.34;
    box(g, 4.4, shape.sy * 0.52, 1.5, px, deckY + 1.3 + shape.sy * 0.26, sz * 0.34, M(MATC.darkSteel, { metalness: 0.6, roughness: 0.4 }));
    for (let i = 0; i < 3; i++)
      box(g, 0.9, 0.9, 0.12, px - 1.2 + i * 1.2, deckY + 1.3 + shape.sy * 0.42, sz * 0.34 + 0.8,
        glowM(i === 0 ? 0x54ffc0 : (i === 1 ? tint : 0x7fdcff), 1.8));
    box(g, 2.6, 2.2, 1.1, px + 3.4, deckY + 2.2, sz * 0.34, accentM(0x67d3c3));
    cyl(g, 0.35, 0.35, 2.4, px + 3.4, deckY + 3.9, sz * 0.34, steelM(), 'y', 8);

    /* small JB on the other end (cable landing for this package) */
    box(g, 2.8, 2.4, 1.4, sx * 0.30, deckY + 1.3 + 1.2, sz * 0.34, M(MATC.dark, { metalness: 0.5, roughness: 0.5 }));
    for (let i = 0; i < 3; i++)
      cyl(g, 0.22, 0.22, 0.9, sx * 0.30 - 0.8 + i * 0.8, deckY + 1.3 + 0.2, sz * 0.34 + 0.7, steelM(), 'y', 8);

    /* handrail on the back edge */
    for (let i = 0; i < 4; i++)
      cyl(g, 0.16, 0.16, shape.sy * 0.42, -sx * 0.42 + i * sx * 0.28, deckY + 1.3 + shape.sy * 0.21, -sz * 0.44, steelM(), 'y', 8);
    cyl(g, 0.16, 0.16, sx * 0.86, 0, deckY + 1.3 + shape.sy * 0.42, -sz * 0.44, steelM(), 'x', 8);
    cyl(g, 0.16, 0.16, sx * 0.86, 0, deckY + 1.3 + shape.sy * 0.24, -sz * 0.44, steelM(), 'x', 8);
  }

  /* =======================================================================
     PAGA LOUDSPEAKER — horn on a bracket (the most common device on site)
     ======================================================================= */
  function buildSpeaker(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const ex = /\(EX\)|\bEX\b|EXPLOSION/.test(d);
    const hy = shape.y + shape.sy * 0.12;

    /* wall/pole bracket */
    box(g, 1.9, shape.sy * 1.5, 0.55, 0, shape.sy * 0.75, -shape.sz * 0.30, steelM());
    box(g, 0.9, 0.9, shape.sz * 0.42, 0, hy + 0.4, -shape.sz * 0.10, steelM());
    sph(g, 0.85, 0, hy + 0.4, shape.sz * 0.08, steelM());
    cyl(g, 0.28, 0.28, 1.5, 0, hy + 0.4, shape.sz * 0.16, steelM(), 'z', 8);

    /* horn: cone (wide mouth forward), throat, driver can */
    const horn = new T.Mesh(new T.CylinderGeometry(shape.sy * 0.42, 0.9, shape.sy * 0.62, 22, 1, true),
                            M(ex ? 0xb4532f : MATC.body, { metalness: 0.5, roughness: 0.5, side: T.DoubleSide }));
    horn.rotation.x = Math.PI / 2;
    horn.position.set(0, hy + 0.4, shape.sz * 0.42);
    g.add(horn);
    torus(g, shape.sy * 0.42, 0.26, 0, hy + 0.4, shape.sz * 0.42 + shape.sy * 0.31, steelM(), [Math.PI / 2, 0, 0], 22);
    cyl(g, 0.95, 0.95, 1.1, 0, hy + 0.4, shape.sz * 0.10, steelM(), 'z', 14);
    cyl(g, 1.35, 1.35, 1.9, 0, hy + 0.4, -shape.sz * 0.14, M(MATC.darkSteel, { roughness: 0.45 }), 'z', 16);
    sph(g, 1.35, 0, hy + 0.4, -shape.sz * 0.24, M(MATC.darkSteel, { roughness: 0.45 }), 1, 1, 0.6);

    /* driver cover band + gland + label */
    cyl(g, 1.42, 1.42, 0.34, 0, hy + 0.4, -shape.sz * 0.06, accentM(tint), 'z', 16);
    cyl(g, 0.30, 0.30, 0.8, 0, hy - 1.05, -shape.sz * 0.14, steelM(), 'y', 8);
    box(g, 1.5, 0.55, 0.1, 0, hy + 1.55, -shape.sz * 0.14, M(MATC.white, { metalness: 0.2, roughness: 0.6 }));
    if (ex) box(g, 1.75, 0.28, 0.12, 0, hy + 1.9, -shape.sz * 0.14, M(0xb4532f, { roughness: 0.6 }));
  }

  /* =======================================================================
     CCTV CAMERA — dome / bullet / PTZ
     ======================================================================= */
  function buildCamera(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const armY = shape.y + shape.sy * 0.30;

    /* wall bracket */
    box(g, 1.7, 1.7, 0.5, 0, armY, -shape.sz * 0.34, steelM());
    cyl(g, 0.42, 0.42, shape.sz * 0.40, 0, armY, -shape.sz * 0.14, steelM(), 'z', 10);
    sph(g, 0.62, 0, armY, shape.sz * 0.04, steelM());

    if (/PTZ|DOME|WATER TANK|THERMAL/.test(d)) {
      /* dome: pan base + body + glass lower dome */
      cyl(g, 2.5, 2.5, 0.55, 0, armY - 0.2, shape.sz * 0.10, M(MATC.darkSteel, { roughness: 0.45 }), 'y', 24);
      cyl(g, shape.sy * 0.40, shape.sy * 0.44, shape.sy * 0.34, 0, armY - shape.sy * 0.28, shape.sz * 0.10, M(MATC.white, { metalness: 0.35, roughness: 0.45 }), 'y', 24);
      const dome = new T.Mesh(new T.SphereGeometry(shape.sy * 0.40, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassM());
      dome.position.set(0, armY - shape.sy * 0.44, shape.sz * 0.10);
      g.add(dome);
      /* lens + IR ring inside the dome */
      cyl(g, 0.72, 0.72, 0.5, 0, armY - shape.sy * 0.40, shape.sz * 0.10, M(MATC.black, { roughness: 0.3 }), 'y', 16);
      cyl(g, 0.34, 0.34, 0.36, 0, armY - shape.sy * 0.52, shape.sz * 0.10, glowM(tint, 0.9), 'y', 14);
      torus(g, shape.sy * 0.40, 0.10, 0, armY - shape.sy * 0.28, shape.sz * 0.10, accentM(tint), [Math.PI / 2, 0, 0], 24);
    } else {
      /* bullet camera: body + sunshield + lens hood */
      cyl(g, shape.sy * 0.26, shape.sy * 0.26, shape.sx * 0.62, 0, armY - 0.4, shape.sz * 0.16, M(MATC.white, { metalness: 0.4, roughness: 0.4 }), 'z', 20);
      cyl(g, shape.sy * 0.30, shape.sy * 0.26, 0.7, 0, armY - 0.4, shape.sz * 0.16 + shape.sx * 0.33, glassM(), 'z', 20);
      box(g, shape.sx * 0.30, 0.22, shape.sx * 0.72, 0, armY - 0.4 + shape.sy * 0.28, shape.sz * 0.16, steelM());
      cyl(g, 0.55, 0.55, shape.sx * 0.30, 0, armY + shape.sy * 0.26, shape.sz * 0.16, steelM(), 'z', 12);
      box(g, 0.5, 1.0, 0.5, 0, armY - 0.4 + shape.sy * 0.30, shape.sz * 0.16 - shape.sx * 0.24, steelM());
    }
  }

  /* =======================================================================
     FLASHING BEACON / SOUNDER
     ======================================================================= */
  function buildBeacon(P) {
    const { g, shape, tint, desc } = P;
    const sounder = /SOUNDER|HORN/.test((desc || '').toUpperCase());
    const baseY = shape.y - shape.sy * 0.20;

    cyl(g, 1.7, 1.9, 0.6, 0, baseY, 0, M(MATC.darkSteel, { roughness: 0.45 }), 'y', 18);
    cyl(g, 1.15, 1.15, 0.5, 0, baseY + 0.55, 0, steelM(), 'y', 16);
    /* lamp dome */
    const dome = new T.Mesh(new T.SphereGeometry(shape.sy * 0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
                            new T.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 1.6, transparent: true, opacity: 0.85, roughness: 0.25 }));
    dome.position.set(0, baseY + 0.8, 0);
    g.add(dome);
    cyl(g, shape.sy * 0.20, shape.sy * 0.20, shape.sy * 0.34, 0, baseY + 1.05, 0, glowM(0xffd27a, 2.4), 'y', 16);
    torus(g, shape.sy * 0.34, 0.14, 0, baseY + 0.8, 0, M(MATC.darkSteel), [Math.PI / 2, 0, 0], 20);
    if (sounder) {
      /* sounder horn beside the beacon */
      const horn = new T.Mesh(new T.CylinderGeometry(1.5, 0.6, 1.8, 18, 1, true), M(0xd9dde2, { roughness: 0.5, side: T.DoubleSide }));
      horn.rotation.x = Math.PI / 2;
      horn.position.set(shape.sx * 0.34, baseY + 0.9, 0.7);
      g.add(horn);
      cyl(g, 0.55, 0.55, 0.9, shape.sx * 0.34, baseY + 0.9, -0.5, M(MATC.darkSteel), 'z', 12);
    }
    cyl(g, 0.26, 0.26, 0.9, -shape.sx * 0.30, baseY - 0.5, 0, steelM(), 'y', 8);
  }

  /* =======================================================================
     BADGE / CARD READER
     ======================================================================= */
  function buildReader(P) {
    const { g, shape, tint, desc } = P;
    const keypad = /KEYPAD|PIN|INTERCOM/.test((desc || '').toUpperCase());
    const cy = shape.y + shape.sy * 0.18;

    box(g, 2.4, 2.4, 0.9, 0, shape.sy * 0.6, -0.5, M(MATC.darkSteel, { roughness: 0.5 }));   // back box
    box(g, shape.sx * 0.72, shape.sy * 0.86, 0.55, 0, cy, 0, M(MATC.dark, { metalness: 0.35, roughness: 0.55 }));
    box(g, shape.sx * 0.60, shape.sy * 0.66, 0.16, 0, cy, 0.34, M(0x22303a, { metalness: 0.3, roughness: 0.6 }));
    /* proximity coil symbol + LED ring */
    torus(g, shape.sy * 0.17, 0.10, 0, cy + shape.sy * 0.16, 0.44, accentM(tint), [0, 0, 0], 20);
    torus(g, shape.sy * 0.09, 0.08, 0, cy + shape.sy * 0.16, 0.44, accentM(tint), [0, 0, 0], 16);
    box(g, shape.sx * 0.30, 0.18, 0.10, 0, cy - shape.sy * 0.06, 0.44, glowM(tint, 2.2));
    if (keypad) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
        box(g, 0.42, 0.42, 0.10, -0.7 + c * 0.7, cy - shape.sy * 0.26 - r * 0.0, 0.44, M(0x0c1418, { roughness: 0.4 }));
      box(g, shape.sx * 0.5, 0.5, 0.08, 0, cy - shape.sy * 0.30, 0.44, glowM(0x7fdcff, 0.7));
    }
  }

  /* =======================================================================
     DOOR / GATE CONTACT, DOORLOCK, BREAK GLASS, EXIT PUSHBUTTON
     ======================================================================= */
  function buildContact(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const y = shape.y + shape.sy * 0.10;

    box(g, shape.sx * 0.9, shape.sy * 0.55, 0.45, 0, y, -0.4, steelM());                 // mounting plate
    box(g, shape.sx * 0.46, shape.sy * 0.34, 0.55, -shape.sx * 0.18, y, 0, M(MATC.white, { metalness: 0.25, roughness: 0.55 }));
    box(g, shape.sx * 0.30, shape.sy * 0.22, 0.30, shape.sx * 0.26, y, 0, M(MATC.darkSteel, { roughness: 0.5 }));   // magnet
    cyl(g, 0.16, 0.16, 0.6, -shape.sx * 0.40, y, 0, steelM(), 'z', 8);
    box(g, 0.16, 0.16, 0.14, -shape.sx * 0.18, y + shape.sy * 0.18, 0.3, glowM(tint, 1.8));

    if (/BREAK GLASS|PUSHBUTTON|PUSH BUTTON|EMERGENCY/.test(d)) {
      cyl(g, shape.sy * 0.26, shape.sy * 0.26, 0.35, shape.sx * 0.34, y, 0.1, accentM(0xff5566), 'z', 18);
      cyl(g, 0.2, 0.2, 0.4, shape.sx * 0.34, y, 0.25, M(0xff9aa5, { roughness: 0.3 }), 'z', 12);
    }
    if (/DOORLOCK|DOOR LOCK|MAGNETIC/.test(d)) {
      box(g, shape.sx * 0.5, shape.sy * 0.5, 0.8, 0, y - shape.sy * 0.30, 0, M(0x2b3a45, { roughness: 0.45 }));
      cyl(g, 0.3, 0.3, 0.9, shape.sx * 0.2, y - shape.sy * 0.30, 0.5, steelM(), 'z', 10);
    }
  }

  /* =======================================================================
     DATA / TV SOCKET, WIRELESS ACCESS POINT, TELEPHONE
     ======================================================================= */
  function buildSocket(P) {
    const { g, shape, tint } = P;
    const y = shape.y + shape.sy * 0.24;

    box(g, shape.sx * 0.62, shape.sy * 0.52, 1.1, 0, y, -0.55, M(MATC.darkSteel, { roughness: 0.5 }));  // back box
    box(g, shape.sx * 0.86, shape.sy * 0.72, 0.32, 0, y, 0, M(MATC.white, { metalness: 0.15, roughness: 0.45 }));
    /* two ports */
    [-1, 1].forEach(s => {
      box(g, shape.sx * 0.28, shape.sy * 0.26, 0.16, s * shape.sx * 0.18, y + shape.sy * 0.06, 0.20, M(0x0c1418, { roughness: 0.35 }));
      box(g, shape.sx * 0.10, shape.sy * 0.10, 0.08, s * shape.sx * 0.18, y + shape.sy * 0.06, 0.26, M(MATC.brass, { metalness: 0.9, roughness: 0.25 }));
    });
    box(g, shape.sx * 0.34, 0.5, 0.06, 0, y - shape.sy * 0.24, 0.19, glowM(tint, 0.4));
  }

  function buildWap(P) {
    const { g, shape, tint } = P;
    const y = shape.y + shape.sy * 0.20;

    cyl(g, shape.sx * 0.30, shape.sx * 0.30, 0.35, 0, y + 1.0, 0, steelM(), 'y', 18);      // ceiling plate
    cyl(g, shape.sx * 0.42, shape.sx * 0.46, 0.9, 0, y + 0.4, 0, M(MATC.white, { metalness: 0.3, roughness: 0.45 }), 'y', 22);
    cyl(g, shape.sx * 0.40, shape.sx * 0.40, 0.14, 0, y - 0.10, 0, accentM(tint), 'y', 22);
    cyl(g, shape.sx * 0.16, shape.sx * 0.16, 0.26, 0, y - 0.24, 0, glowM(tint, 2.2), 'y', 14);
    /* two antennas */
    [-1, 1].forEach(s => {
      const a = cyl(g, 0.18, 0.18, shape.sy * 0.6, s * shape.sx * 0.34, y + 1.1, -shape.sz * 0.18, M(MATC.dark, { roughness: 0.55 }), 'y', 8);
      a.rotation.x = s * 0.26;
    });
  }

  function buildPhone(P) {
    const { g, shape, tint, desc } = P;
    const withBeacon = /BEACON|SOUNDER/.test((desc || '').toUpperCase());
    const y = shape.y + shape.sy * 0.18;

    box(g, shape.sx * 0.80, shape.sy * 0.78, 1.3, 0, y, -0.6, M(MATC.darkSteel, { roughness: 0.5 }));
    box(g, shape.sx * 0.94, shape.sy * 0.90, 0.45, 0, y, 0, M(0xe02a2a, { metalness: 0.3, roughness: 0.5 }));  // emergency red housing
    /* handset on the cradle */
    const hy = y + shape.sy * 0.20;
    box(g, shape.sx * 0.26, shape.sy * 0.62, 0.45, -shape.sx * 0.16, hy, 0.42, M(MATC.dark, { roughness: 0.5 }));
    [-1, 1].forEach(s => sph(g, 0.34, -shape.sx * 0.16, hy + s * shape.sy * 0.30, 0.46, M(MATC.dark, { roughness: 0.5 })));
    box(g, shape.sx * 0.42, 0.2, 0.2, -shape.sx * 0.05, hy + shape.sy * 0.38, 0.52, steelM());
    /* keypad + display */
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++)
      box(g, 0.34, 0.34, 0.12, shape.sx * 0.16 + (c - 1) * 0.55, hy - shape.sy * 0.22 + r * 0.0 - r * 0.0, 0.30, M(0x1a232b, { roughness: 0.4 }));
    box(g, shape.sx * 0.36, 0.55, 0.10, shape.sx * 0.16, hy + shape.sy * 0.22, 0.30, glowM(0x7fdcff, 0.6));
    if (withBeacon) {
      const b = new T.Mesh(new T.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                           new T.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 }));
      b.position.set(0, y + shape.sy * 0.52, -0.2);
      g.add(b);
      cyl(g, 0.5, 0.5, 0.9, 0, y + shape.sy * 0.32, -0.2, glowM(0xffd27a, 2.2), 'y', 12);
    }
    cyl(g, 0.22, 0.22, 0.8, 0, y - shape.sy * 0.50, -0.4, steelM(), 'y', 8);
  }

  /* =======================================================================
     FIELD INSTRUMENT — transmitter on a standpipe with manifold + gauge
     ======================================================================= */
  function buildInstrument(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const acc = accentM(tint);
    const pipeTop = shape.y + shape.sy * 0.22;

    /* process standpipe + root valve + manifold */
    cyl(g, 0.62, 0.78, shape.sy * 0.9, 0, shape.sy * 0.45, 0, pipeM(), 'y', 14);
    flange(g, 1.5, 0, 0.5, 0, steelM(), 'y');
    cyl(g, 0.9, 0.9, 0.9, 0, shape.sy * 0.82, 0, M(MATC.darkSteel, { roughness: 0.45 }), 'y', 14);
    handwheel(g, 1.15, 0, shape.sy * 0.82 + 0.85, 0, acc, [Math.PI / 2, 0, 0]);
    box(g, 2.2, 0.7, 1.0, 0, pipeTop, 0, steelM());                     // manifold block
    cyl(g, 0.34, 0.34, 1.4, 0, pipeTop, 0.9, pipeM(), 'z', 10);

    /* transmitter housing (horizontal can with two caps) + display face */
    const ty = pipeTop + shape.sy * 0.30;
    cyl(g, 1.55, 1.55, 3.2, 0, ty, -0.4, M(0xd6dee4, { metalness: 0.3, roughness: 0.45 }), 'z', 20);
    [-1, 1].forEach(s => cyl(g, 1.62, 1.62, 0.34, 0, ty, -0.4 + s * 1.75, M(MATC.darkSteel, { roughness: 0.4 }), 'z', 20));
    box(g, 1.75, 1.35, 0.16, 0, ty, 1.40, M(0x0b1419, { roughness: 0.25, metalness: 0.1 }));
    box(g, 1.35, 0.85, 0.06, 0, ty + 0.12, 1.50, glowM(tint, 0.75));
    /* bracket + cable entries */
    box(g, 0.28, 1.2, 1.2, 0, ty - 1.4, -0.4, steelM());
    cyl(g, 0.30, 0.30, 0.9, 1.1, ty - 1.55, -0.9, steelM(), 'y', 8);
    cyl(g, 0.30, 0.30, 0.9, -1.1, ty - 1.55, -0.9, steelM(), 'y', 8);

    /* local gauge on the manifold */
    cyl(g, 0.95, 0.95, 0.34, 0, pipeTop + 0.9, 0, M(MATC.white, { metalness: 0.3, roughness: 0.5 }), 'y', 16);
    cyl(g, 0.75, 0.75, 0.05, 0, pipeTop + 1.10, 0, M(0xf2f7fa, { metalness: 0.1, roughness: 0.4 }), 'y', 16);
    box(g, 0.10, 0.55, 0.07, 0.12, pipeTop + 1.16, 0.12, M(0x22303a), [0, 0.7, 0.5]);

    if (/FLOW/.test(d)) cyl(g, 2.0, 2.0, 1.2, 0, shape.y, 0, acc, 'x', 22);   // spool piece
    if (/LEVEL/.test(d)) cyl(g, 1.1, 1.1, shape.sy * 0.8, 0, shape.y, 0, acc, 'y', 18);
    if (/VIBRATION/.test(d)) sph(g, 1.1, 0, ty, 0, acc);
  }

  /* =======================================================================
     MOTOR / PUMP — TEFC body with fins, fan cowl, terminal box, feet
     ======================================================================= */
  function buildMotor(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const acc = accentM(tint);
    const cy = shape.y + shape.sy * 0.10;
    const r = shape.sy * 0.30;

    /* feet + baseplate */
    box(g, shape.sx * 0.9, 1.0, shape.sz * 0.9, 0, 0.5, 0, steelM());
    [-1, 1].forEach(s => box(g, 1.6, 1.4, shape.sz * 0.5, s * shape.sx * 0.28, 1.6, 0, M(MATC.darkSteel, { roughness: 0.45 })));

    /* stator barrel + cooling fins */
    cyl(g, r, r, shape.sx * 0.62, 0, cy, 0, M(MATC.darkSteel, { metalness: 0.65, roughness: 0.42 }), 'x', 26);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      box(g, shape.sx * 0.60, 0.28, 0.42, 0, cy + Math.cos(a) * r, Math.sin(a) * r, M(0x35454f, { metalness: 0.7, roughness: 0.45 }), [a, 0, 0]);
    }
    /* fan cowl on the drive end + shaft + coupling */
    cyl(g, r * 0.92, r * 0.72, shape.sx * 0.16, shape.sx * 0.39, cy, 0, M(MATC.dark, { roughness: 0.55 }), 'x', 24);
    cyl(g, r * 0.30, r * 0.30, shape.sx * 0.26, shape.sx * 0.55, cy, 0, steelM(), 'x', 14);
    cyl(g, r * 0.52, r * 0.52, shape.sx * 0.14, shape.sx * 0.62, cy, 0, acc, 'x', 18);
    /* non-drive end cap + terminal box + cable entry */
    cyl(g, r * 0.96, r * 0.96, shape.sx * 0.08, -shape.sx * 0.35, cy, 0, M(MATC.darkSteel, { roughness: 0.45 }), 'x', 24);
    box(g, shape.sx * 0.30, shape.sy * 0.34, shape.sz * 0.42, -shape.sx * 0.12, cy + r * 0.95, 0, M(0x2e3d48, { roughness: 0.5 }));
    cyl(g, 0.42, 0.42, 1.0, -shape.sx * 0.12, cy + r * 0.95 + shape.sy * 0.24, 0, steelM(), 'y', 10);
    /* nameplate */
    box(g, shape.sx * 0.20, 0.10, 0.6, 0.05, cy + r * 0.55, r * 0.86, M(MATC.brass, { metalness: 0.85, roughness: 0.3 }));

    if (/PUMP/.test(d)) {
      /* volute casing + suction/discharge flanges on the drive end */
      sph(g, r * 1.05, shape.sx * 0.58, cy - r * 0.30, 0, acc, 1, 0.9, 1);
      cyl(g, r * 0.45, r * 0.45, shape.sx * 0.16, shape.sx * 0.74, cy - r * 0.30, 0, steelM(), 'x', 16);
      cyl(g, r * 0.42, r * 0.42, shape.sx * 0.20, shape.sx * 0.58, cy + r * 0.60, 0, steelM(), 'y', 16);
      flange(g, r * 0.62, shape.sx * 0.58, cy + r * 0.86, 0, steelM(), 'y');
    }
  }

  /* =======================================================================
     PANEL / SWITCHBOARD — enclosure with door, hinges, handle, vents, plinth
     ======================================================================= */
  function buildPanel(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz;
    const cy = shape.y;

    box(g, w * 1.04, 0.9, dp * 1.04, 0, 0.45, 0, M(MATC.darkSteel, { roughness: 0.5 }));  // plinth
    box(g, w, h, dp, 0, cy, 0, M(MATC.body, { metalness: 0.45, roughness: 0.5 }));         // enclosure
    /* doors: two leaves with a gap, hinges on the outside */
    [-1, 1].forEach(s => {
      box(g, w * 0.46, h * 0.92, 0.30, s * w * 0.24, cy, dp / 2 + 0.15, M(0x54677a, { metalness: 0.5, roughness: 0.45 }));
      [-1, 1].forEach(t => box(g, 0.32, 0.9, 0.34, s * w * 0.46, cy + t * h * 0.32, dp / 2 + 0.12, steelM()));
      /* handle */
      box(g, 0.28, h * 0.16, 0.36, s * w * 0.05, cy, dp / 2 + 0.34, steelM());
    });
    /* vents top and bottom */
    for (let i = 0; i < 5; i++) {
      box(g, w * 0.80, 0.20, 0.14, 0, cy - h * 0.40 + i * 0.9, dp / 2 + 0.32, M(0x0d151b, { roughness: 0.6 }));
      box(g, w * 0.80, 0.20, 0.14, 0, cy + h * 0.32 + i * 0.9, dp / 2 + 0.32, M(0x0d151b, { roughness: 0.6 }));
    }
    /* status lamps + HMI */
    for (let k = 0; k < 3; k++)
      box(g, 0.9, 0.9, 0.16, -w * 0.20 + k * 1.4, cy + h * 0.30, dp / 2 + 0.32,
        glowM(k === 0 ? 0x54ffc0 : (k === 1 ? 0xffd166 : 0xff5f6d), 1.9));
    box(g, 2.6, 1.6, 0.18, w * 0.18, cy + h * 0.26, dp / 2 + 0.32, glowM(0x7fdcff, 0.5));
    /* cable entry at the bottom + earth bar */
    box(g, w * 0.30, 0.5, dp * 0.55, -w * 0.22, 0.75, 0, M(0x111a21, { roughness: 0.6 }));
  }

  /* =======================================================================
     JUNCTION BOX — GRP enclosure, lid + screws, glands, conduit drops
     ======================================================================= */
  function buildJunction(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz, cy = shape.y;

    box(g, w, h, dp, 0, cy, 0, M(0x2b3a46, { metalness: 0.35, roughness: 0.6 }));
    box(g, w * 1.03, h * 0.12, dp * 1.03, 0, cy + h * 0.50, 0, M(0x35454f, { roughness: 0.55 }));  // lid
    [-1, 1].forEach(x => [-1, 1].forEach(z =>
      cyl(g, 0.16, 0.16, 0.22, x * w * 0.40, cy + h * 0.56, z * dp * 0.40, steelM(), 'y', 8)));
    /* gland plate at the bottom + brass glands */
    box(g, w * 0.82, 0.35, dp * 0.30, 0, cy - h * 0.48, dp * 0.30, steelM());
    for (let i = 0; i < 3; i++) {
      cyl(g, 0.30, 0.30, 0.7, -w * 0.24 + i * w * 0.24, cy - h * 0.62, dp * 0.30, M(MATC.brass, { metalness: 0.9, roughness: 0.3 }), 'y', 10);
      cyl(g, 0.36, 0.36, 0.18, -w * 0.24 + i * w * 0.24, cy - h * 0.90, dp * 0.30, M(0x1b2833, { roughness: 0.6 }), 'y', 10);
    }
    /* two conduit stubs into the top + status LED + label pocket */
    [-1, 1].forEach(s => {
      cyl(g, 0.42, 0.42, h * 0.55, s * w * 0.28, cy + h * 0.72, -dp * 0.10, steelM(), 'y', 10);
      cyl(g, 0.50, 0.50, 0.20, s * w * 0.28, cy + h * 0.99, -dp * 0.10, M(0x22303a), 'y', 10);
    });
    box(g, 1.3, 1.3, 0.12, 0, cy, dp / 2 + 0.08, glowM(tint, 2.1));
    box(g, w * 0.44, h * 0.22, 0.06, 0, cy - h * 0.26, dp / 2 + 0.06, M(MATC.white, { metalness: 0.15, roughness: 0.6 }));
  }

  /* =======================================================================
     CHARGER / UPS — panel + battery rack + JB annex
     ======================================================================= */
  function buildPower(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz, cy = shape.y;

    box(g, w * 0.92, 0.7, dp * 0.92, -w * 0.04, 0.35, 0, M(MATC.darkSteel, { roughness: 0.5 }));
    box(g, w * 0.82, h, dp * 0.86, -w * 0.04, cy, 0, M(MATC.body, { metalness: 0.45, roughness: 0.5 }));
    /* door + louvres + meters */
    box(g, w * 0.62, h * 0.86, 0.28, -w * 0.04, cy, dp * 0.43 + 0.14, M(0x54677a, { metalness: 0.5, roughness: 0.45 }));
    for (let k = 0; k < 6; k++)
      box(g, w * 0.44, 0.18, 0.12, -w * 0.04, cy - h * 0.30 + k * 0.85, dp * 0.43 + 0.32, M(0x0d151b, { roughness: 0.6 }));
    box(g, 1.5, 1.0, 0.16, -w * 0.18, cy + h * 0.26, dp * 0.43 + 0.32, glowM(0x7fdcff, 0.7));
    box(g, 1.0, 1.0, 0.16, w * 0.08, cy + h * 0.26, dp * 0.43 + 0.32, glowM(0x54ffc0, 1.9));
    box(g, 0.24, h * 0.14, 0.30, w * 0.20, cy, dp * 0.43 + 0.30, steelM());
    /* battery rack: two tiers of cells with terminal posts and links */
    for (let t = 0; t < 2; t++) {
      for (let k = 0; k < 3; k++) {
        const bx = w * 0.28 + k * w * 0.11;
        box(g, w * 0.10, 1.9, dp * 0.52, bx, 1.6 + t * 2.2, 0, M(0x22303a, { metalness: 0.35, roughness: 0.65 }));
        [-1, 1].forEach(s => cyl(g, 0.20, 0.20, 0.40, bx, 2.75 + t * 2.2, s * dp * 0.16, M(MATC.brass, { metalness: 0.9, roughness: 0.3 }), 'y', 8));
      }
      box(g, w * 0.34, 0.22, dp * 0.56, w * 0.39, 2.75 + t * 2.2, 0, M(0x8a939b, { metalness: 0.8, roughness: 0.35 }));
    }
    /* JB annex on the flank + conduit */
    box(g, 2.8, 2.6, dp * 0.72, w * 0.52, cy - 1.2, 0, M(0x2b3a46, { roughness: 0.55 }));
    box(g, 3.0, 0.28, dp * 0.76, w * 0.52, cy + 0.2, 0, M(0x35454f, { roughness: 0.5 }));
    for (let i = 0; i < 2; i++)
      cyl(g, 0.34, 0.34, 1.2, w * 0.52, cy + 1.1 + i * 0.2, -dp * 0.18 + i * dp * 0.34, steelM(), 'y', 8);
    box(g, 0.9, 0.9, 0.12, w * 0.52, cy - 1.2, dp * 0.38, glowM(tint, 2.0));
  }

  /* =======================================================================
     TRANSFORMER — tank, radiators, HV/LV bushings, conservator, plinth
     ======================================================================= */
  function buildTransformer(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz, cy = shape.y;

    box(g, w * 1.02, 1.4, dp * 1.02, 0, 0.7, 0, M(0x3c4a56, { roughness: 0.55 }));      // plinth
    box(g, w * 0.88, h * 0.72, dp * 0.80, 0, cy - h * 0.06, 0, M(0x4a5a68, { metalness: 0.55, roughness: 0.45 })); // tank
    /* radiator banks left/right: fins + headers */
    [-1, 1].forEach(s => {
      box(g, w * 0.16, h * 0.52, dp * 0.72, s * w * 0.52, cy - h * 0.06, 0, M(0x39485a, { roughness: 0.5 }));
      for (let k = 0; k < 4; k++)
        box(g, 0.28, h * 0.46, dp * 0.66, s * (w * 0.46 + k * 0.42), cy - h * 0.06, 0, M(0x2f3d47, { metalness: 0.7, roughness: 0.45 }));
      cyl(g, 0.30, 0.30, h * 0.44, s * w * 0.56, cy - h * 0.06, dp * 0.30, pipeM(), 'y', 10);
      cyl(g, 0.30, 0.30, h * 0.44, s * w * 0.56, cy - h * 0.06, -dp * 0.30, pipeM(), 'y', 10);
    });
    /* HV bushings on top (3) + LV bushings on the front face */
    for (let k = 0; k < 3; k++) {
      const bx = -w * 0.24 + k * w * 0.24;
      cyl(g, 0.72, 1.05, h * 0.34, bx, cy + h * 0.30 + h * 0.17, 0, M(MATC.white, { metalness: 0.25, roughness: 0.4 }), 'y', 14);
      cyl(g, 1.15, 1.15, 0.5, bx, cy + h * 0.30 + h * 0.36, 0, accentM(tint), 'y', 14);
      cyl(g, 0.22, 0.22, 0.6, bx, cy + h * 0.30 + h * 0.42, 0, steelM(), 'y', 8);
    }
    for (let k = 0; k < 4; k++)
      cyl(g, 0.55, 0.55, h * 0.16, -w * 0.24 + k * w * 0.16, cy - h * 0.30, dp * 0.42, M(MATC.white, { metalness: 0.25, roughness: 0.4 }), 'z', 12);
    /* conservator drum on top + Buchholz + control cabinet */
    cyl(g, 1.5, 1.5, w * 0.55, 0, cy + h * 0.30 + 2.4, -dp * 0.30, pipeM(), 'x', 18);
    [-1, 1].forEach(s => sph(g, 1.5, s * w * 0.28, cy + h * 0.30 + 2.4, -dp * 0.30, pipeM(), 1, 1, 1));
    box(g, w * 0.18, h * 0.30, dp * 0.22, w * 0.42, cy - h * 0.20, dp * 0.50, M(0x2b3a46, { roughness: 0.55 }));
    box(g, 0.7, 0.7, 0.14, w * 0.42, cy - h * 0.12, dp * 0.62, glowM(tint, 1.8));
    /* nameplate */
    box(g, w * 0.22, h * 0.08, 0.10, 0, cy - h * 0.02, dp * 0.41, M(MATC.white, { metalness: 0.2, roughness: 0.6 }));
  }

  /* =======================================================================
     GENERATOR — engine, alternator, radiator, exhaust, skid, day tank
     ======================================================================= */
  function buildGenerator(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz, cy = shape.y;

    /* skid base + drip tray */
    box(g, w * 1.02, 1.2, dp * 0.92, 0, 0.6, 0, M(0x3c4a56, { roughness: 0.55 }));
    /* alternator barrel */
    cyl(g, h * 0.34, h * 0.34, w * 0.34, w * 0.16, cy, 0, M(MATC.darkSteel, { metalness: 0.6, roughness: 0.42 }), 'x', 24);
    cyl(g, h * 0.30, h * 0.30, w * 0.08, w * 0.36, cy, 0, M(MATC.dark, { roughness: 0.5 }), 'x', 22);
    /* fan cowl + coupling cover */
    cyl(g, h * 0.26, h * 0.20, w * 0.10, w * 0.42, cy, 0, accentM(tint), 'x', 22);
    /* engine block with rocker covers */
    box(g, w * 0.40, h * 0.44, dp * 0.62, -w * 0.26, cy - h * 0.02, 0, M(0x44525e, { metalness: 0.5, roughness: 0.5 }));
    for (let k = 0; k < 4; k++)
      box(g, w * 0.06, h * 0.14, dp * 0.54, -w * 0.40 + k * w * 0.085, cy + h * 0.24, 0, M(0x2f3d47, { metalness: 0.55, roughness: 0.45 }));
    /* turbo + air filter + exhaust stack + silencer */
    sph(g, h * 0.12, -w * 0.10, cy + h * 0.26, dp * 0.30, steelM());
    cyl(g, h * 0.14, h * 0.14, w * 0.14, -w * 0.34, cy + h * 0.22, -dp * 0.30, M(0x8a939b, { metalness: 0.7, roughness: 0.4 }), 'x', 14);
    cyl(g, 0.62, 0.62, h * 0.62, -w * 0.42, cy + h * 0.45, dp * 0.22, steelM(), 'y', 12);
    cyl(g, 1.15, 1.15, h * 0.22, -w * 0.42, cy + h * 0.80, dp * 0.22, M(0x37454f, { roughness: 0.5 }), 'y', 14);
    /* radiator at the engine end with fan shroud */
    box(g, w * 0.10, h * 0.62, dp * 0.78, -w * 0.50, cy, 0, M(0x2f3d47, { metalness: 0.45, roughness: 0.5 }));
    cyl(g, h * 0.26, h * 0.26, 0.5, -w * 0.46, cy, 0, M(0x1b2833, { roughness: 0.55 }), 'x', 18);
    /* day tank + control panel */
    box(g, w * 0.20, h * 0.30, dp * 0.40, w * 0.02, cy + h * 0.42, -dp * 0.24, M(0x54677a, { metalness: 0.45, roughness: 0.5 }));
    box(g, 2.6, h * 0.34, 0.6, -w * 0.30, cy + h * 0.10, dp * 0.44, M(0x2b3a46, { roughness: 0.5 }));
    for (let k = 0; k < 3; k++)
      box(g, 0.7, 0.7, 0.14, -w * 0.30 - 0.8 + k * 0.8, cy + h * 0.18, dp * 0.50, glowM(k ? 0x7fdcff : 0xffd166, 1.8));
  }

  /* =======================================================================
     LIGHTING — floodlight / highbay / bollard / luminaire
     ======================================================================= */
  function buildLight(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const wy = shape.y + shape.sy * 0.30;

    if (/\bFL|FLOOD/.test(d)) {
      cyl(g, 0.6, 0.6, shape.sy * 1.3, 0, shape.y * 0.8, -shape.sz * 0.30, steelM(), 'y', 10);
      box(g, shape.sx * 0.62, shape.sy * 0.42, 1.2, 0, wy, shape.sz * 0.02, M(0x2b3a46, { roughness: 0.5 }));
      box(g, shape.sx * 0.50, shape.sy * 0.32, 0.25, 0, wy, shape.sz * 0.02 + 0.66, glowM(0xfff3c4, 1.5));
      box(g, shape.sx * 0.66, 0.18, 1.35, 0, wy + shape.sy * 0.26, shape.sz * 0.02, steelM());
    } else if (/BOLLARD|POST/.test(d)) {
      cyl(g, 1.5, 1.7, shape.sy * 0.9, 0, shape.sy * 0.45, 0, M(MATC.darkSteel, { roughness: 0.5 }), 'y', 16);
      cyl(g, 1.15, 1.15, shape.sy * 0.18, 0, shape.sy * 0.9, 0, glowM(0xfff3c4, 1.7), 'y', 16);
      sph(g, 1.3, 0, shape.sy * 0.95, 0, M(0xe8eef4, { metalness: 0.2, roughness: 0.4 }), 1, 0.5, 1);
    } else {
      /* highbay / luminaire with reflector cone */
      cyl(g, 0.35, 0.35, shape.sy * 0.5, 0, shape.sy * 0.95, 0, steelM(), 'y', 8);
      const refl = new T.Mesh(new T.CylinderGeometry(shape.sx * 0.44, 1.2, shape.sy * 0.34, 20, 1, true),
                              M(0x2b3a46, { metalness: 0.6, roughness: 0.4, side: T.DoubleSide }));
      refl.position.set(0, wy + 0.5, 0);
      g.add(refl);
      cyl(g, shape.sx * 0.40, shape.sx * 0.40, 0.5, 0, wy + 0.28, 0, glowM(0xfff3c4, 1.7), 'y', 20);
      cyl(g, 1.15, 1.15, 0.6, 0, wy + 0.62, 0, M(0x37454f, { roughness: 0.5 }), 'y', 16);
    }
  }

  /* =======================================================================
     HVAC — AHU / FCU cabinet with fan grille, filters and duct spigots
     ======================================================================= */
  function buildHvac(P) {
    const { g, shape, tint } = P;
    const w = shape.sx, h = shape.sy, dp = shape.sz, cy = shape.y;

    box(g, w * 1.02, 0.8, dp * 1.02, 0, 0.4, 0, M(0x3c4a56, { roughness: 0.55 }));
    box(g, w, h, dp, 0, cy, 0, M(0x5a6a76, { metalness: 0.4, roughness: 0.55 }));
    /* fan grille (circular louvres) on the front */
    for (let k = 0; k < 3; k++)
      torus(g, w * 0.11 - k * w * 0.026, 0.10, -w * 0.20, cy, dp / 2 + 0.06, M(0x2b3a46), [0, 0, 0], 20);
    box(g, w * 0.30, h * 0.34, 0.14, w * 0.22, cy - h * 0.10, dp / 2 + 0.05, M(0x0d151b, { roughness: 0.6 }));
    /* filter frames + duct spigots */
    for (let k = 0; k < 3; k++)
      box(g, w * 0.22, h * 0.10, 0.16, w * 0.22, cy - h * 0.30 + k * h * 0.16, dp / 2 + 0.10, M(0x8a939b, { metalness: 0.6, roughness: 0.4 }));
    cyl(g, w * 0.20, w * 0.20, h * 0.34, -w * 0.24, cy + h * 0.58, 0, M(0x9aa6b0, { metalness: 0.6, roughness: 0.4 }), 'y', 18);
    cyl(g, w * 0.16, w * 0.16, h * 0.26, w * 0.24, cy - h * 0.62, 0, M(0x9aa6b0, { metalness: 0.6, roughness: 0.4 }), 'y', 18);
    box(g, 1.6, 1.0, 0.14, -w * 0.30, cy + h * 0.34, dp / 2 + 0.05, glowM(tint, 1.6));
  }

  /* =======================================================================
     generic instrument-less device — small wall unit with a plate + LED
     ======================================================================= */
  function buildDevice(P) {
    const { g, shape, tint } = P;
    const cy = shape.y;
    box(g, shape.sx * 0.9, 0.8, shape.sz * 0.9, 0, 0.4, 0, M(MATC.darkSteel, { roughness: 0.5 }));
    box(g, shape.sx * 0.78, shape.sy * 0.86, shape.sz * 0.72, 0, cy, 0, M(0x3c4a56, { metalness: 0.45, roughness: 0.5 }));
    box(g, shape.sx * 0.50, shape.sy * 0.30, 0.16, 0, cy + shape.sy * 0.12, shape.sz * 0.38, M(0x22303a));
    box(g, 0.9, 0.9, 0.12, -shape.sx * 0.20, cy - shape.sy * 0.20, shape.sz * 0.38, glowM(tint, 1.9));
    cyl(g, 0.30, 0.30, 1.1, shape.sx * 0.28, cy + shape.sy * 0.55, -shape.sz * 0.18, steelM(), 'y', 8);
  }

  /* =======================================================================
     PUMP — API 610 style: baseplate, volute, suction + discharge flanges,
     coupling guard, TEFC motor, seal pot, gauges, local starter
     ======================================================================= */
  function buildPump(P) {
    const { g, shape, tint, desc } = P;
    const d = (desc || '').toUpperCase();
    const acc = accentM(tint);
    const w = shape.sx, dp = shape.sz;
    const cy = shape.y;
    const r = shape.sy * 0.24;

    /* baseplate + drip rim + anchor bolts */
    box(g, w, 1.1, dp * 1.05, 0, 0.55, 0, M(0x3c4a56, { roughness: 0.55 }));
    box(g, w * 0.98, 0.5, dp * 1.02, 0, 1.25, 0, M(0x2f3d47, { metalness: 0.5, roughness: 0.5 }));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) =>
      cyl(g, 0.3, 0.3, 0.5, a * w * 0.44, 1.4, b * dp * 0.42, steelM(), 'y', 8));

    /* volute casing (pump end) + suction nozzle along X + discharge up */
    const px = -w * 0.26;
    sph(g, r * 1.15, px, cy - r * 0.15, 0, acc, 1, 0.92, 1);
    cyl(g, r * 0.55, r * 0.55, w * 0.20, px - w * 0.20, cy - r * 0.15, 0, pipeM(), 'x', 18);
    flange(g, r * 0.78, px - w * 0.30, cy - r * 0.15, 0, steelM(), 'x');
    /* discharge: vertical spool + elbow + flange */
    cyl(g, r * 0.42, r * 0.42, shape.sy * 0.34, px, cy - r * 0.15 + shape.sy * 0.22, 0, pipeM(), 'y', 18);
    torus(g, r * 0.40, r * 0.40, px, cy - r * 0.15 + shape.sy * 0.38, 0, pipeM(), [Math.PI / 2, 0, 0], 18);
    flange(g, r * 0.62, px, cy - r * 0.15 + shape.sy * 0.42, 0, steelM(), 'y');
    /* casing bolts + drain plug + vent */
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      cyl(g, r * 0.07, r * 0.07, r * 0.32, px - w * 0.06, cy - r * 0.15 + Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, steelM(), 'x', 6);
    }
    cyl(g, r * 0.14, r * 0.14, r * 0.5, px, cy - r * 1.25, 0, steelM(), 'y', 8);
    /* seal chamber + shaft + coupling guard */
    cyl(g, r * 0.42, r * 0.42, w * 0.14, px + w * 0.16, cy - r * 0.15, 0, M(0x44525e, { metalness: 0.6, roughness: 0.45 }), 'x', 16);
    box(g, w * 0.14, r * 0.9, r * 0.9, px + w * 0.26, cy - r * 0.15, 0, accentM(tint));   // coupling guard
    /* motor: barrel, fins, fan cowl, terminal box */
    const mx = w * 0.20;
    cyl(g, r * 0.86, r * 0.86, w * 0.34, mx, cy - r * 0.15, 0, M(0x35454f, { metalness: 0.65, roughness: 0.42 }), 'x', 22);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      box(g, w * 0.32, 0.24, 0.36, mx, cy - r * 0.15 + Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86,
        M(0x2d3b45, { metalness: 0.7, roughness: 0.45 }), [a, 0, 0]);
    }
    cyl(g, r * 0.80, r * 0.62, w * 0.07, mx + w * 0.20, cy - r * 0.15, 0, M(0x24313a, { roughness: 0.5 }), 'x', 20);
    cyl(g, r * 0.78, r * 0.78, w * 0.05, mx - w * 0.18, cy - r * 0.15, 0, M(0x2f3d47, { roughness: 0.45 }), 'x', 20);
    box(g, w * 0.10, r * 0.42, r * 0.55, mx - w * 0.02, cy - r * 0.15 + r * 0.92, 0, M(0x2b3a46, { roughness: 0.5 }));
    cyl(g, 0.34, 0.34, 0.7, mx - w * 0.02, cy - r * 0.15 + r * 1.10, 0, steelM(), 'y', 8);
    /* seal pot / flush plan + two gauges */
    box(g, 1.5, r * 0.85, 1.3, px + w * 0.16, 2.0 + r * 0.4, -dp * 0.34, M(0x54677a, { metalness: 0.45, roughness: 0.5 }));
    [-1, 1].forEach(s => {
      cyl(g, 0.75, 0.75, 0.26, px + s * w * 0.10, cy + r * 1.05, dp * 0.16, M(MATC.white, { metalness: 0.3, roughness: 0.5 }), 'y', 14);
      cyl(g, 0.10, 0.10, 0.9, px + s * w * 0.10, cy + r * 0.65, dp * 0.16, steelM(), 'y', 6);
    });
    /* local control / VFD box for fire pumps */
    if (/FIRE|JOCKEY|DIESEL/.test(d)) {
      box(g, 2.6, shape.sy * 0.36, 1.2, w * 0.44, cy + shape.sy * 0.10, dp * 0.40, M(0x2b3a46, { roughness: 0.5 }));
      for (let k = 0; k < 3; k++)
        box(g, 0.7, 0.7, 0.14, w * 0.44 - 0.8 + k * 0.8, cy + shape.sy * 0.18, dp * 0.40 + 0.66, glowM(k ? 0x7fdcff : 0x54ffc0, 1.8));
    }
  }

  /* =======================================================================
     GAS / FIRE DETECTOR — detector head on a standpipe with sunshade
     ======================================================================= */
  function buildDetector(P) {
    const { g, shape, tint } = P;
    const acc = accentM(tint);
    const topY = shape.y + shape.sy * 0.34;

    /* floor stand + mounting plate */
    cyl(g, 1.3, 1.5, 0.5, 0, 0.25, 0, M(0x3c4a56, { roughness: 0.55 }), 'y', 14);
    cyl(g, 0.42, 0.42, shape.sy * 0.80, 0, shape.sy * 0.40, 0, steelM(), 'y', 12);
    flange(g, 0.8, 0, 0.55, 0, steelM(), 'y', false);
    /* junction box at the base with a cable gland */
    box(g, 2.0, 1.8, 1.5, 0, 1.3, 0, M(0x2b3a46, { roughness: 0.55 }));
    cyl(g, 0.3, 0.3, 0.6, 0.7, 1.3, 0.9, M(MATC.brass, { metalness: 0.9, roughness: 0.3 }), 'z', 8);
    /* sensor head: body + sintered cap + sunshade */
    cyl(g, 1.05, 1.05, 1.5, 0, topY - 0.6, 0, M(0xd6dee4, { metalness: 0.35, roughness: 0.45 }), 'y', 18);
    cyl(g, 0.95, 0.95, 0.9, 0, topY + 0.35, 0, acc, 'y', 18);
    cyl(g, 0.80, 0.80, 0.30, 0, topY + 0.95, 0, M(0x1b2833, { roughness: 0.7 }), 'y', 16);
    torus(g, 1.0, 0.12, 0, topY + 0.75, 0, steelM(), [Math.PI / 2, 0, 0], 18);
    /* sunshade */
    cyl(g, 1.9, 1.9, 0.18, 0, topY + 1.35, 0, steelM(), 'y', 18);
    cyl(g, 0.14, 0.14, 0.9, 0, topY + 1.85, 0, steelM(), 'y', 6);
  }

  window.CAB3D_DEVICES = {
    VALVE: buildValve,
    PUMP: buildPump,
    DETECTOR: buildDetector,
    SKID: buildSkid,
    SPEAKER: buildSpeaker,
    CAMERA: buildCamera,
    BEACON: buildBeacon,
    READER: buildReader,
    CONTACT: buildContact,
    SOCKET: buildSocket,
    WAP: buildWap,
    PHONE: buildPhone,
    INSTRUMENT: buildInstrument,
    MOTOR: buildMotor,
    PANEL: buildPanel,
    JUNCTION: buildJunction,
    POWER: buildPower,
    TRANSFORMER: buildTransformer,
    GENERATOR: buildGenerator,
    LIGHT: buildLight,
    HVAC: buildHvac,
    DEVICE: buildDevice
  };
})();
