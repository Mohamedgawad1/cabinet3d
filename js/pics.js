/* ------------------------------------------------------------------------
   Device pictures
   Every equipment family can be rendered to a real image straight from its
   3D model — no external files needed — so a device card always shows a
   picture of the actual kit, whether or not an NWD render exists yet.
   Real renders exported from Navisworks live in data/img/<tag>.png and take
   priority when present.
   ------------------------------------------------------------------------ */
(function () {
  const T = THREE;
  let renderer = null, scene = null, cam = null, light = null;
  const cache = new Map();       // kind|desc -> dataURL
  const realCache = new Map();   // tag -> dataURL | null

  function ensure() {
    if (renderer) return;
    const canvas = document.createElement('canvas');
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(240, 180, false);
    renderer.outputEncoding = T.sRGBEncoding;

    scene = new T.Scene();
    const hemi = new T.HemisphereLight(0xdfefff, 0x101a22, 1.15);
    scene.add(hemi);
    const key = new T.DirectionalLight(0xffffff, 1.5); key.position.set(6, 9, 8); scene.add(key);
    const fill = new T.DirectionalLight(0x8fd4ff, 0.85); fill.position.set(-7, 4, -6); scene.add(fill);
    light = key;

    cam = new T.PerspectiveCamera(38, 240 / 180, 0.1, 4000);
  }

  function build(kind, desc, tint, tag) {
    const g = new T.Group();
    const shape = (window.CAB3D_KIND_SHAPE && window.CAB3D_KIND_SHAPE[kind]) ||
      { sx: 12, sy: 9, sz: 8, y: 6 };
    const fn = window.CAB3D_DEVICES && window.CAB3D_DEVICES[kind];
    let top = 0;
    if (fn) {
      try {
        fn({ g, shape, tint, desc: desc || '', tag: tag || '', ref: false, bad: false });
      } catch (e) { /* fall through to a plain block */ }
    }
    if (!g.children.length) {
      const m = new T.Mesh(new T.BoxGeometry(shape.sx, shape.sy, shape.sz),
        new T.MeshStandardMaterial({ color: 0x2b3a46, metalness: 0.5, roughness: 0.5 }));
      m.position.y = shape.y;
      g.add(m);
    }
    const box = new T.Box3().setFromObject(g);
    top = box.max.y;
    return { g, box, top };
  }

  /* rendered picture of the procedural model */
  function render(kind, desc, tint) {
    const key = kind + '|' + (desc || '');
    if (cache.has(key)) return cache.get(key);
    ensure();
    const built = build(kind, desc, tint);
    scene.add(built.g);

    const box = built.box;
    const size = box.getSize(new T.Vector3());
    const center = box.getCenter(new T.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
    const dist = radius / Math.tan(cam.fov * Math.PI / 360) * 1.55;

    /* three-quarter view, slightly above */
    cam.position.set(center.x + dist * 0.78, center.y + dist * 0.52, center.z + dist * 0.82);
    cam.lookAt(center);
    cam.near = Math.max(0.05, dist * 0.02);
    cam.far = dist * 12;
    cam.updateProjectionMatrix();

    const bg = new T.Color(0x0b1620);
    renderer.setClearColor(bg, 1);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');

    scene.remove(built.g);
    built.g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    cache.set(key, url);
    return url;
  }

  /* try a real Navisworks render first */
  async function real(tag) {
    if (realCache.has(tag)) return realCache.get(tag);
    const safe = String(tag).replace(/[^A-Za-z0-9._-]/g, '_');
    const url = 'data/img/' + safe + '.png';
    const ok = await new Promise(res => {
      const im = new Image();
      im.onload = () => res(true);
      im.onerror = () => res(false);
      im.src = url;
    });
    const value = ok ? url : null;
    realCache.set(tag, value);
    return value;
  }

  /* a real render of the whole equipment family, exported from the model */
  function famPic(kind) {
    const man = window.C3D_FAM || {};
    if (!man[kind]) return null;
    return 'data/img/fam/' + kind + '.png';
  }

  /* synchronously produce the best available picture for a card */
  function thumbFor(kind, desc, tag) {
    const fam = famPic(kind);
    if (fam) return fam;
    const tint = (window.CAB3D_KIND_COLOR && window.CAB3D_KIND_COLOR[kind]) || 0x7f9bb0;
    return render(kind, desc, tint);
  }

  window.CAB3D_PIC = { thumbFor, real, famPic, render };
})();
