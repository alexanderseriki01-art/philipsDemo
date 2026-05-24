/* Register backdrop — animated wireframe mesh.
   A subdivided icosphere whose vertices are displaced each frame by
   layered 3D simplex noise. Rendered as a glowing blue wireframe so
   the triangulated mesh structure visibly breathes and morphs.
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
    mount.appendChild(renderer.domElement);

    // ── Scene + camera ────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 11);
    camera.lookAt(0, 0, 0);

    // ── Mesh: icosphere with noise displacement ───────────────
    const BASE_R = 2.6;
    const DETAIL = 4;                 // 5120 faces — plenty for wireframe density
    const geo = new THREE.IcosahedronGeometry(BASE_R, DETAIL);
    const basePositions = new Float32Array(geo.attributes.position.array);

    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x88b1ff,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, wireMat);
    scene.add(mesh);

    // Subtle solid inner shell so the mesh has a "skin"
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x1f54d4,
        transparent: true,
        opacity: 0.10,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const inner = new THREE.Mesh(geo, innerMat);
    scene.add(inner);

    // ── 3D simplex noise (Stefan Gustavson, compact port) ─────
    const noise3D = (() => {
        const grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
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
            const F3 = 1/3, G3 = 1/6;
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
                if (y0 >= z0)      { i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
                else if (x0 >= z0) { i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
                else               { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
            } else {
                if (y0 < z0)       { i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
                else if (x0 < z0)  { i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
                else               { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
            }
            const x1=x0-i1+G3,     y1=y0-j1+G3,     z1=z0-k1+G3;
            const x2=x0-i2+2*G3,   y2=y0-j2+2*G3,   z2=z0-k2+2*G3;
            const x3=x0-1+3*G3,    y3=y0-1+3*G3,    z3=z0-1+3*G3;
            const ii=i&255, jj=j&255, kk=k&255;
            const gi0 = perm[ii      + perm[jj      + perm[kk     ]]] % 12;
            const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
            const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
            const gi3 = perm[ii + 1  + perm[jj + 1  + perm[kk + 1 ]]] % 12;
            let n0=0,n1=0,n2=0,n3=0;
            let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
            if (t0>0){t0*=t0; const g=grad3[gi0]; n0 = t0*t0*(g[0]*x0+g[1]*y0+g[2]*z0);}
            let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
            if (t1>0){t1*=t1; const g=grad3[gi1]; n1 = t1*t1*(g[0]*x1+g[1]*y1+g[2]*z1);}
            let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
            if (t2>0){t2*=t2; const g=grad3[gi2]; n2 = t2*t2*(g[0]*x2+g[1]*y2+g[2]*z2);}
            let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
            if (t3>0){t3*=t3; const g=grad3[gi3]; n3 = t3*t3*(g[0]*x3+g[1]*y3+g[2]*z3);}
            return 32 * (n0+n1+n2+n3);
        };
    })();

    // ── Sparkle dust around the mesh ──────────────────────────
    const PCOUNT = 280;
    const partPos = new Float32Array(PCOUNT * 3);
    for (let i = 0; i < PCOUNT; i++) {
        const r = 3.6 + Math.pow(Math.random(), 0.55) * 5.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        partPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        partPos[i * 3 + 1] = r * Math.cos(phi);
        partPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));

    const partTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0,    'rgba(255, 255, 255, 1)');
        g.addColorStop(0.35, 'rgba(168, 196, 255, 0.6)');
        g.addColorStop(1,    'rgba(90, 142, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    })();

    const partMat = new THREE.PointsMaterial({
        size: 0.16,
        map: partTex,
        color: 0xc8d4ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    const dust = new THREE.Points(partGeo, partMat);
    scene.add(dust);

    // ── Soft halo behind the mesh ─────────────────────────────
    const haloGeo = new THREE.SphereGeometry(1.5, 24, 24);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0x4a7cff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.z = -0.5;
    scene.add(halo);

    // ── Mouse parallax ────────────────────────────────────────
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
        mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // ── Animate ───────────────────────────────────────────────
    let t = 0;
    let rafId = null;
    const positions = geo.attributes.position.array;

    function animate() {
        t += 0.0055;

        // Vertex displacement along the unit normal — mesh morphs
        for (let i = 0; i < positions.length; i += 3) {
            const ox = basePositions[i];
            const oy = basePositions[i + 1];
            const oz = basePositions[i + 2];
            const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
            const nx = ox / len, ny = oy / len, nz = oz / len;

            const n1 = noise3D(ox * 0.42 + t * 0.85, oy * 0.42,             oz * 0.42);
            const n2 = noise3D(ox * 0.18 - t * 0.50, oy * 0.18 + t * 0.32,  oz * 0.18);
            const n3 = noise3D(ox * 0.80 + t * 1.10, oy * 0.80 - t * 0.40,  oz * 0.80);

            const d = BASE_R + n1 * 0.50 + n2 * 0.36 + n3 * 0.16;
            positions[i]     = nx * d;
            positions[i + 1] = ny * d;
            positions[i + 2] = nz * d;
        }
        geo.attributes.position.needsUpdate = true;

        // Slow rotation
        mesh.rotation.y  += 0.0025;
        mesh.rotation.x  = Math.sin(t * 0.35) * 0.18;
        inner.rotation.copy(mesh.rotation);

        // Dust drifts opposite for parallax depth
        dust.rotation.y = -t * 0.06;
        dust.rotation.x = Math.cos(t * 0.4) * 0.10;

        // Halo breathes
        haloMat.opacity = 0.10 + Math.sin(t * 0.9) * 0.04;

        // Camera mouse parallax
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        camera.position.x = mouse.x * 1.3;
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
