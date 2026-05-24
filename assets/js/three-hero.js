/* Liquid-metal blob hero.
   IcosahedronGeometry displaced per-frame by layered 3D simplex noise.
   MeshPhysicalMaterial with metalness, iridescence, and clearcoat,
   lit by a procedurally-generated equirectangular PMREM envmap.
*/

(function () {
    if (typeof THREE === 'undefined') return;
    const mount = document.getElementById('three-hero');
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
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // ── Scene + camera ────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 11);

    // ── Procedural environment for PBR reflections ────────────
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 1024;
    envCanvas.height = 512;
    const ectx = envCanvas.getContext('2d');

    // sky-like gradient — gives the "horizon" reflected on the metal
    const grad = ectx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#0a2059');
    grad.addColorStop(0.30, '#1f54d4');
    grad.addColorStop(0.50, '#a8c4ff');
    grad.addColorStop(0.55, '#e0eaff');
    grad.addColorStop(0.62, '#2f6bf2');
    grad.addColorStop(1.00, '#02061a');
    ectx.fillStyle = grad;
    ectx.fillRect(0, 0, 1024, 512);

    // Scatter soft light "studio" highlights into the env
    ectx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * 1024;
        const y = 60 + Math.random() * 280;
        const r = 40 + Math.random() * 90;
        const rg = ectx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(200, 220, 255, 0.6)');
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

    // ── Ambient + key lights ──────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const keyLight = new THREE.DirectionalLight(0xaaccff, 1.4);
    keyLight.position.set(5, 8, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x5588ff, 0.55);
    rimLight.position.set(-7, -3, -2);
    scene.add(rimLight);

    // ── Blob geometry & material ──────────────────────────────
    const BASE_R = 2.8;
    const DETAIL = 4; // 5120 faces, ~15k non-indexed verts
    const geo = new THREE.IcosahedronGeometry(BASE_R, DETAIL);
    const basePositions = new Float32Array(geo.attributes.position.array);

    const material = new THREE.MeshPhysicalMaterial({
        color: 0x050505,
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        iridescence: 0.95,
        iridescenceIOR: 1.55,
        iridescenceThicknessRange: [220, 760]
    });

    const blob = new THREE.Mesh(geo, material);
    scene.add(blob);

    // ── 3D simplex noise (Stefan Gustavson, compact JS port) ──
    const noise3D = (() => {
        const grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
        const perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
        }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

        return function (xin, yin, zin) {
            const F3 = 1 / 3, G3 = 1 / 6;
            const s = (xin + yin + zin) * F3;
            const i = Math.floor(xin + s);
            const j = Math.floor(yin + s);
            const k = Math.floor(zin + s);
            const tt = (i + j + k) * G3;
            const x0 = xin - (i - tt);
            const y0 = yin - (j - tt);
            const z0 = zin - (k - tt);

            let i1, j1, k1, i2, j2, k2;
            if (x0 >= y0) {
                if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
                else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
                else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
            } else {
                if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
                else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
                else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
            }

            const x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
            const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
            const x3 = x0 - 1 + 3 * G3,  y3 = y0 - 1 + 3 * G3,  z3 = z0 - 1 + 3 * G3;

            const ii = i & 255, jj = j & 255, kk = k & 255;
            const gi0 = perm[ii      + perm[jj      + perm[kk     ]]] % 12;
            const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
            const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
            const gi3 = perm[ii + 1  + perm[jj + 1  + perm[kk + 1 ]]] % 12;

            let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
            let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
            if (t0 > 0) { t0 *= t0; const g = grad3[gi0]; n0 = t0 * t0 * (g[0]*x0 + g[1]*y0 + g[2]*z0); }
            let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
            if (t1 > 0) { t1 *= t1; const g = grad3[gi1]; n1 = t1 * t1 * (g[0]*x1 + g[1]*y1 + g[2]*z1); }
            let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
            if (t2 > 0) { t2 *= t2; const g = grad3[gi2]; n2 = t2 * t2 * (g[0]*x2 + g[1]*y2 + g[2]*z2); }
            let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
            if (t3 > 0) { t3 *= t3; const g = grad3[gi3]; n3 = t3 * t3 * (g[0]*x3 + g[1]*y3 + g[2]*z3); }
            return 32 * (n0 + n1 + n2 + n3);
        };
    })();

    // ── Mouse parallax ────────────────────────────────────────
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
        mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // ── Animation loop ────────────────────────────────────────
    let t = 0;
    let rafId = null;

    const positions = geo.attributes.position.array;

    function animate() {
        t += 0.006;

        // Layered noise displacement along the unit normal
        for (let i = 0; i < positions.length; i += 3) {
            const ox = basePositions[i];
            const oy = basePositions[i + 1];
            const oz = basePositions[i + 2];
            const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
            const nx = ox / len, ny = oy / len, nz = oz / len;

            const n1 = noise3D(ox * 0.38 + t * 0.85, oy * 0.38,             oz * 0.38);
            const n2 = noise3D(ox * 0.18 - t * 0.50, oy * 0.18 + t * 0.32,  oz * 0.18);
            const n3 = noise3D(ox * 0.75 + t * 1.20, oy * 0.75 - t * 0.40,  oz * 0.75);

            const d = BASE_R + n1 * 0.55 + n2 * 0.42 + n3 * 0.18;
            positions[i]     = nx * d;
            positions[i + 1] = ny * d;
            positions[i + 2] = nz * d;
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();

        // Slow tumble
        blob.rotation.y += 0.002;
        blob.rotation.x = Math.sin(t * 0.4) * 0.18;

        // Camera mouse parallax
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        camera.position.x = mouse.x * 1.4;
        camera.position.y = -mouse.y * 0.9;
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
