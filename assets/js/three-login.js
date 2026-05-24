/* Login backdrop — floating glass polyhedra, biased to the left half
   so the sign-in card on the right sits in clean space.
*/

(function () {
    if (typeof THREE === 'undefined') return;
    const mount = document.querySelector('.three-mount');
    if (!mount) return;

    const W = () => mount.clientWidth;
    const H = () => mount.clientHeight;

    // ── Renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Scene + camera ────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 10);

    // ── Procedural envmap (gives glass the sky to reflect) ────
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 1024;
    envCanvas.height = 512;
    const ectx = envCanvas.getContext('2d');
    const grad = ectx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#0a2059');
    grad.addColorStop(0.30, '#1f54d4');
    grad.addColorStop(0.50, '#a8c4ff');
    grad.addColorStop(0.55, '#e0eaff');
    grad.addColorStop(0.62, '#2f6bf2');
    grad.addColorStop(1.00, '#02061a');
    ectx.fillStyle = grad;
    ectx.fillRect(0, 0, 1024, 512);
    ectx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
        const x = Math.random() * 1024;
        const y = 60 + Math.random() * 260;
        const r = 50 + Math.random() * 90;
        const rg = ectx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(200, 220, 255, 0.55)');
        rg.addColorStop(1, 'rgba(200, 220, 255, 0)');
        ectx.fillStyle = rg;
        ectx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromEquirectangular(envTex).texture;
    scene.environment = envMap;
    envTex.dispose();
    pmrem.dispose();

    // ── Lights ────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.30));
    const key = new THREE.DirectionalLight(0xaaccff, 1.1);
    key.position.set(5, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5588ff, 0.55);
    rim.position.set(-6, -2, -3);
    scene.add(rim);

    // ── Reusable unit geometries ──────────────────────────────
    const UNIT = {
        icosahedron:  new THREE.IcosahedronGeometry(1, 0),
        octahedron:   new THREE.OctahedronGeometry(1, 0),
        tetrahedron:  new THREE.TetrahedronGeometry(1, 0),
        dodecahedron: new THREE.DodecahedronGeometry(1, 0)
    };
    const EDGES = {};
    for (const k in UNIT) EDGES[k] = new THREE.EdgesGeometry(UNIT[k]);

    // ── Materials ─────────────────────────────────────────────
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xa8c4ff,
        metalness: 0.05,
        roughness: 0.10,
        transmission: 0.92,
        thickness: 0.6,
        ior: 1.45,
        envMapIntensity: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        attenuationColor: 0x6c9aff,
        attenuationDistance: 6,
        side: THREE.DoubleSide
    });
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0xdfe9ff,
        transparent: true,
        opacity: 0.85
    });

    // ── Polyhedra (positions biased to the left) ──────────────
    const CONFIG = [
        { type: 'icosahedron',  scale: 1.7,  pos: [-3.6,  1.2, -1.8], spin: [0.0022, 0.0036, 0],      float: { amp: 0.40, freq: 0.7, phase: 0.0 } },
        { type: 'dodecahedron', scale: 0.85, pos: [-1.0,  2.6, -2.6], spin: [0.0034, 0.0018, 0.0008], float: { amp: 0.35, freq: 0.9, phase: 1.2 } },
        { type: 'octahedron',   scale: 1.2,  pos: [-2.8, -1.7, -0.8], spin: [0.0028, 0.0044, 0.0002], float: { amp: 0.50, freq: 0.6, phase: 2.1 } },
        { type: 'tetrahedron',  scale: 0.7,  pos: [-4.4,  0.0,  0.4], spin: [0.0042, 0.0032, 0.0019], float: { amp: 0.35, freq: 1.1, phase: 3.0 } },
        { type: 'icosahedron',  scale: 2.3,  pos: [-2.4,  0.2, -7.0], spin: [0.0012, 0.0019, 0],      float: { amp: 0.30, freq: 0.4, phase: 1.7 } },
        { type: 'octahedron',   scale: 0.55, pos: [-5.6,  1.8,  0.4], spin: [0.0055, 0.0040, 0],      float: { amp: 0.25, freq: 1.3, phase: 0.4 } },
        { type: 'tetrahedron',  scale: 0.5,  pos: [ 0.4, -2.6, -1.0], spin: [0.0045, 0.0050, 0.0010], float: { amp: 0.30, freq: 1.0, phase: 2.6 } }
    ];

    const shapes = [];
    for (const cfg of CONFIG) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(UNIT[cfg.type], glassMat);
        body.scale.setScalar(cfg.scale);
        group.add(body);
        const edges = new THREE.LineSegments(EDGES[cfg.type], edgeMat);
        edges.scale.setScalar(cfg.scale * 1.001);
        group.add(edges);
        group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        group.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        group.userData = { spin: cfg.spin, baseY: cfg.pos[1], float: cfg.float };
        scene.add(group);
        shapes.push(group);
    }

    // ── Mouse parallax on camera ──────────────────────────────
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
        mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // ── Animate ───────────────────────────────────────────────
    let t = 0, rafId = null;

    function animate() {
        t += 0.0055;

        for (const shape of shapes) {
            const ud = shape.userData;
            shape.rotation.x += ud.spin[0];
            shape.rotation.y += ud.spin[1];
            shape.rotation.z += ud.spin[2];
            shape.position.y = ud.baseY + Math.sin(t * ud.float.freq + ud.float.phase) * ud.float.amp;
        }

        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        camera.position.x = mouse.x * 1.2;
        camera.position.y = -mouse.y * 0.8;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);

    // ── Resize ────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = W() / H();
        camera.updateProjectionMatrix();
        renderer.setSize(W(), H());
    });

    // ── Pause when offscreen ──────────────────────────────────
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting && rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            } else if (e.isIntersecting && !rafId) {
                rafId = requestAnimationFrame(animate);
            }
        });
    });
    io.observe(mount);
})();
