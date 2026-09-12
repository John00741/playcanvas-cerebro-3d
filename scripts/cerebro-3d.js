var Cerebro3D = pc.createScript('cerebro3d');

Cerebro3D.attributes.add('domeRadius', { type: 'number', default: 130, title: 'Curvatura do domo (teto/paredes)' });
Cerebro3D.attributes.add('domeAngleDeg', { type: 'number', default: 100, title: 'Ate onde o domo desce (>90 = paredes encurvam pro chao)' });
Cerebro3D.attributes.add('moveSpeed', { type: 'number', default: 30, title: 'Velocidade de caminhada' });
Cerebro3D.attributes.add('lookSpeed', { type: 'number', default: 0.2, title: 'Sensibilidade do mouse' });
Cerebro3D.attributes.add('eyeHeight', { type: 'number', default: 1.8, title: 'Altura dos olhos do personagem' });
Cerebro3D.attributes.add('interactRange', { type: 'number', default: 9, title: 'Distancia para interagir com uma regiao' });

// As 4 regioes que vao hospedar os minijogos - cada uma e uma estacao
// navegavel dentro da sala, nao so decoracao. O conteudo do modal aqui e
// placeholder ate cada minijogo real ser plugado nesse mesmo gancho.
var REGIONS = [
    {
        key: 'cortex',
        name: 'Córtex Pré-frontal',
        subtitle: 'Razão / Planejamento',
        color: [0.35, 0.55, 0.95],
        desc: 'Pesa consequências, prazos e planos de longo prazo antes de agir.'
    },
    {
        key: 'amigdala',
        name: 'Amígdala',
        subtitle: 'Medo / Emoção',
        color: [0.92, 0.30, 0.30],
        desc: 'Reage rápido ao risco e à pressão emocional do momento.'
    },
    {
        key: 'hipocampo',
        name: 'Hipocampo',
        subtitle: 'Memória',
        color: [0.62, 0.40, 0.92],
        desc: 'Puxa experiências passadas parecidas para comparar com a decisão atual.'
    },
    {
        key: 'accumbens',
        name: 'Núcleo Accumbens',
        subtitle: 'Desejo / Prazer',
        color: [0.95, 0.75, 0.25],
        desc: 'Aponta para o que traz satisfação e recompensa imediata.'
    }
];

Cerebro3D.prototype.initialize = function () {
    // Cap render resolution to 1x CSS pixels - the earlier "travando" was
    // fixed by this + the unlit material below (per-pixel lighting on a
    // giant, screen-filling, two-sided surface every frame was the cost).
    this.app.graphicsDevice.maxPixelRatio = 1;

    this.hideDefaultPrimitives();
    this.buildRoom();
    this.loadBrainCenterpiece();
    this.buildRegions();
    this.buildOverlay();
    this.setupCamera();
    this.setupControls();

    this.nearRegion = null;
    this.modalOpen = false;
};

Cerebro3D.prototype.hideDefaultPrimitives = function () {
    var names = ['Caixa', 'Avião', 'Box', 'Plane', 'Luz', 'Light'];
    var self = this;
    names.forEach(function (n) {
        var e = self.app.root.findByName(n);
        if (e) e.enabled = false;
    });
};

// Gentle rolling folds for wall/floor surface detail - kept subtle so it
// never blocks walking, but still gives the "organic tissue" read up close.
Cerebro3D.prototype.wrinkleAt = function (u, v) {
    return (
        0.05 * Math.sin(5 * u) * Math.sin(4 * v) +
        0.03 * Math.sin(9 * u + 1.3) * Math.sin(7 * v + 0.6) +
        0.018 * Math.sin(15 * u - 2 * v)
    );
};

Cerebro3D.prototype.foldColor = function (wrinkle) {
    var valley = { r: 0.30, g: 0.08, b: 0.13 };
    var ridge = { r: 0.95, g: 0.55, b: 0.52 };
    var t = pc.math.clamp(wrinkle * 6 + 0.5, 0, 1);
    return [
        pc.math.lerp(valley.r, ridge.r, t),
        pc.math.lerp(valley.g, ridge.g, t),
        pc.math.lerp(valley.b, ridge.b, t)
    ];
};

// Builds one enclosed, walkable room: a domed ceiling/wall (upper part of a
// sphere, flared slightly past vertical so it curls back toward the floor
// like an organic cavern) fused with a flat-ish floor disc at the rim.
// Everything renders unlit (cheap, and correct from any angle without
// worrying about normal direction) with per-vertex colour for the folds.
Cerebro3D.prototype.buildRoom = function () {
    var thetaMax = this.domeAngleDeg * pc.math.DEG_TO_RAD;
    var R = this.domeRadius;
    var rimY = R * Math.cos(thetaMax);
    this.floorY = 0;
    this.rimRadius = R * Math.sin(thetaMax);
    this.ceilingHeight = R * (1 - Math.cos(thetaMax));

    var material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(0, 0, 0);
    material.useLighting = false;
    material.emissiveVertexColor = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    this.roomMaterial = material;

    var domeMesh = this.buildDomeMesh(R, thetaMax, rimY);
    var domeInstance = new pc.MeshInstance(domeMesh, material);
    var dome = new pc.Entity('SalaTeto');
    dome.addComponent('render', { meshInstances: [domeInstance] });
    this.app.root.addChild(dome);

    var floorMesh = this.buildFloorMesh(this.rimRadius);
    var floorInstance = new pc.MeshInstance(floorMesh, material);
    var floor = new pc.Entity('SalaChao');
    floor.addComponent('render', { meshInstances: [floorInstance] });
    this.app.root.addChild(floor);
};

Cerebro3D.prototype.buildDomeMesh = function (R, thetaMax, rimY) {
    var latSegments = 48;
    var lonSegments = 64;
    var positions = [];
    var colors = [];
    var indices = [];

    for (var lat = 0; lat <= latSegments; lat++) {
        var theta = (lat / latSegments) * thetaMax;
        for (var lon = 0; lon <= lonSegments; lon++) {
            var phi = (lon / lonSegments) * Math.PI * 2;

            var wrinkle = this.wrinkleAt(theta * 6, phi);
            var r = R * (1 + wrinkle);
            var sinTheta = Math.sin(theta);
            var x = r * sinTheta * Math.cos(phi);
            var y = r * Math.cos(theta) - rimY;
            var z = r * sinTheta * Math.sin(phi);

            positions.push(x, y, z);
            var c = this.foldColor(wrinkle);
            colors.push(c[0], c[1], c[2], 1);
        }
    }

    var rowSize = lonSegments + 1;
    for (lat = 0; lat < latSegments; lat++) {
        for (lon = 0; lon < lonSegments; lon++) {
            var a = lat * rowSize + lon;
            var b = a + rowSize;
            var c2 = a + 1;
            var d = b + 1;
            indices.push(a, b, c2);
            indices.push(c2, b, d);
        }
    }

    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
};

Cerebro3D.prototype.buildFloorMesh = function (rimRadius) {
    var rings = 24;
    var segments = 64;
    var positions = [0, 0, 0];
    var colors = [];
    var c0 = this.foldColor(0.15);
    colors.push(c0[0], c0[1], c0[2], 1);
    var indices = [];

    for (var ring = 1; ring <= rings; ring++) {
        var r = (ring / rings) * rimRadius;
        for (var seg = 0; seg < segments; seg++) {
            var phi = (seg / segments) * Math.PI * 2;
            var wrinkle = this.wrinkleAt(r * 0.08, phi) * 0.15;
            var x = (r + wrinkle * r) * Math.cos(phi);
            var z = (r + wrinkle * r) * Math.sin(phi);
            var y = wrinkle * 2;
            positions.push(x, y, z);
            var c = this.foldColor(wrinkle);
            colors.push(c[0], c[1], c[2], 1);
        }
    }

    // Center fan (ring 1)
    for (var s = 0; s < segments; s++) {
        var next = (s + 1) % segments;
        indices.push(0, 1 + s, 1 + next);
    }
    // Remaining rings
    for (ring = 1; ring < rings; ring++) {
        var ringStart = 1 + (ring - 1) * segments;
        var nextRingStart = 1 + ring * segments;
        for (s = 0; s < segments; s++) {
            var sNext = (s + 1) % segments;
            var a = ringStart + s;
            var b = ringStart + sNext;
            var c = nextRingStart + s;
            var d = nextRingStart + sNext;
            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
};

// The real downloaded brain model (CC-BY, Poly by Google) hangs as a
// decorative centerpiece in the middle of the room, instead of being the
// walkable space itself - like the "memory orbs" in Inside Out or a mental
// landmark in Psychonauts, rather than a literal anatomical shell.
Cerebro3D.prototype.loadBrainCenterpiece = function () {
    var asset = this.app.assets.find('brain.glb', 'model');
    if (!asset) return;

    var self = this;
    var place = function () {
        var brain = new pc.Entity('CerebroCentral');
        brain.addComponent('model', { type: 'asset', asset: asset });
        self.app.root.addChild(brain);

        var meshInstances = brain.model.meshInstances;
        var aabb = new pc.BoundingBox();
        meshInstances.forEach(function (mi, i) {
            if (i === 0) aabb.copy(mi.aabb);
            else aabb.add(mi.aabb);
        });
        var maxExtent = Math.max(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z) || 1;
        var targetRadius = self.domeRadius * 0.16;
        var scale = targetRadius / maxExtent;
        brain.setLocalScale(scale, scale, scale);
        brain.setPosition(
            -aabb.center.x * scale,
            self.ceilingHeight * 0.55 - aabb.center.y * scale,
            -aabb.center.z * scale
        );

        meshInstances.forEach(function (mi) {
            var mat = mi.material;
            mat.cull = pc.CULLFACE_NONE;
            mat.useLighting = false;
            mat.diffuse = new pc.Color(0, 0, 0);
            mat.emissive = new pc.Color(0.95, 0.6, 0.35);
            mat.update();
        });

        self.centerpiece = brain;
    };

    if (asset.resource) place();
    else {
        asset.once('load', place);
        this.app.assets.load(asset);
    }
};

// Places each of the 4 regions as a real, walkable station around the
// room's floor (not just decoration) - this is where each region's
// minigame will eventually plug in.
Cerebro3D.prototype.buildRegions = function () {
    var self = this;
    var stationRadius = this.rimRadius * 0.6;
    this.regions = REGIONS.map(function (region, i) {
        var angle = (i / REGIONS.length) * Math.PI * 2;
        var pos = new pc.Vec3(
            Math.cos(angle) * stationRadius,
            self.domeRadius * 0.05,
            Math.sin(angle) * stationRadius
        );

        var mat = new pc.StandardMaterial();
        mat.diffuse = new pc.Color(0, 0, 0);
        mat.useLighting = false;
        mat.emissive = new pc.Color(region.color[0], region.color[1], region.color[2]);
        mat.cull = pc.CULLFACE_NONE;
        mat.update();

        var marker = new pc.Entity('Regiao_' + region.key);
        marker.addComponent('render', { type: 'sphere', material: mat });
        marker.setLocalScale(self.domeRadius * 0.06, self.domeRadius * 0.1, self.domeRadius * 0.06);
        marker.setPosition(pos);
        self.app.root.addChild(marker);

        return {
            data: region,
            position: pos,
            entity: marker,
            baseY: pos.y
        };
    });
};

// Single DOM-injected overlay for the interaction prompt + region modal -
// reuses the fast "one script builds the whole UI" pattern from the 2D
// minigame prototype instead of building PlayCanvas UI entities by hand.
Cerebro3D.prototype.buildOverlay = function () {
    document.documentElement.lang = 'pt-BR';

    var root = document.createElement('div');
    root.className = 'notranslate';
    root.translate = false;
    root.setAttribute('translate', 'no');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:Arial,sans-serif;z-index:1000;';

    root.innerHTML =
        '<div id="regionPrompt" style="display:none;position:absolute;bottom:60px;left:50%;transform:translateX(-50%);' +
        'background:rgba(10,4,8,0.85);color:#fff;padding:10px 18px;border-radius:8px;font-size:15px;text-align:center;">' +
        '</div>' +
        '<div id="regionModal" style="display:none;position:absolute;inset:0;background:rgba(5,2,4,0.75);' +
        'align-items:center;justify-content:center;pointer-events:auto;">' +
        '<div style="max-width:420px;background:#1a1016;border-radius:14px;padding:28px;color:#f4eeee;' +
        'border:2px solid var(--accent,#fff);box-shadow:0 10px 40px rgba(0,0,0,0.5);">' +
        '<div id="regionModalTitle" style="font-size:22px;font-weight:bold;margin-bottom:2px;"></div>' +
        '<div id="regionModalSubtitle" style="font-size:13px;opacity:0.7;margin-bottom:14px;"></div>' +
        '<div id="regionModalDesc" style="font-size:15px;line-height:1.5;margin-bottom:10px;"></div>' +
        '<div style="font-size:13px;opacity:0.6;margin-bottom:20px;">Minijogo desta região: em construção.</div>' +
        '<button id="regionModalClose" style="background:#fff;border:none;border-radius:6px;padding:8px 16px;' +
        'font-size:14px;cursor:pointer;">Fechar (Esc)</button>' +
        '</div></div>';

    document.body.appendChild(root);
    this.overlayRoot = root;
    this.promptEl = root.querySelector('#regionPrompt');
    this.modalEl = root.querySelector('#regionModal');

    var self = this;
    root.querySelector('#regionModalClose').addEventListener('click', function () {
        self.closeModal();
    });
};

Cerebro3D.prototype.showPrompt = function (region) {
    this.promptEl.textContent = 'Pressione E — ' + region.data.name;
    this.promptEl.style.display = 'block';
};

Cerebro3D.prototype.hidePrompt = function () {
    this.promptEl.style.display = 'none';
};

Cerebro3D.prototype.openModal = function (region) {
    this.modalOpen = true;
    document.exitPointerLock();
    this.hidePrompt();

    var c = region.data.color;
    var accent = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
    this.modalEl.querySelector('#regionModalTitle').textContent = region.data.name;
    this.modalEl.querySelector('#regionModalTitle').style.color = accent;
    this.modalEl.querySelector('#regionModalSubtitle').textContent = region.data.subtitle;
    this.modalEl.querySelector('#regionModalDesc').textContent = region.data.desc;
    this.modalEl.style.setProperty('--accent', accent);
    this.modalEl.style.display = 'flex';
};

Cerebro3D.prototype.closeModal = function () {
    this.modalOpen = false;
    this.modalEl.style.display = 'none';
};

Cerebro3D.prototype.setupCamera = function () {
    // This script is expected on the camera entity itself.
    this.entity.setPosition(0, this.eyeHeight, this.rimRadius * 0.5);
    this.entity.setEulerAngles(0, 180, 0);
    if (this.entity.camera) {
        this.entity.camera.farClip = this.domeRadius * 6;
        this.entity.camera.nearClip = 0.1;
        this.entity.camera.clearColor = new pc.Color(0.03, 0.01, 0.02);
    }
    this.yaw = 180;
    this.pitch = 0;
};

Cerebro3D.prototype.setupControls = function () {
    var self = this;
    var canvas = this.app.graphicsDevice.canvas;

    canvas.addEventListener('click', function () {
        canvas.requestPointerLock();
    });

    this.app.mouse.on(pc.EVENT_MOUSEMOVE, function (e) {
        if (!document.pointerLockElement) return;
        self.yaw -= e.dx * self.lookSpeed;
        self.pitch -= e.dy * self.lookSpeed;
        self.pitch = pc.math.clamp(self.pitch, -80, 80);
        self.entity.setEulerAngles(self.pitch, self.yaw, 0);
    });

    this.app.mouse.disableContextMenu();
};

Cerebro3D.prototype.update = function (dt) {
    var keyboard = this.app.keyboard;

    // Gentle bob so the region markers read as active stations, not props.
    var t = Date.now() * 0.002;
    this.regions.forEach(function (region, i) {
        var pos = region.entity.getPosition();
        region.entity.setPosition(pos.x, region.baseY + Math.sin(t + i) * 1.5, pos.z);
        region.entity.rotate(0, dt * 20, 0);
    });

    if (keyboard.wasPressed(pc.KEY_ESCAPE) && this.modalOpen) {
        this.closeModal();
    }

    if (this.modalOpen) return;

    // Find the nearest region within interaction range, show its prompt,
    // and let E open that region's station (future minigame entry point).
    var camPos = this.entity.getPosition();
    var nearest = null;
    var nearestDist = this.interactRange;
    this.regions.forEach(function (region) {
        var dx = region.position.x - camPos.x;
        var dz = region.position.z - camPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = region;
        }
    });

    if (nearest !== this.nearRegion) {
        this.nearRegion = nearest;
        if (nearest) this.showPrompt(nearest);
        else this.hidePrompt();
    }

    if (this.nearRegion && keyboard.wasPressed(pc.KEY_E)) {
        this.openModal(this.nearRegion);
    }

    // Walk on the floor plane: movement follows facing yaw only (pitch is
    // ignored) so looking up/down never launches the character into the
    // walls/ceiling - a proper walking character, not a free-fly camera.
    var yawRad = this.yaw * pc.math.DEG_TO_RAD;
    var forward = new pc.Vec3(-Math.sin(yawRad), 0, -Math.cos(yawRad));
    var right = new pc.Vec3(Math.cos(yawRad), 0, -Math.sin(yawRad));
    var dir = new pc.Vec3();

    if (keyboard.isPressed(pc.KEY_W) || keyboard.isPressed(pc.KEY_UP)) dir.add(forward);
    if (keyboard.isPressed(pc.KEY_S) || keyboard.isPressed(pc.KEY_DOWN)) dir.sub(forward);
    if (keyboard.isPressed(pc.KEY_D)) dir.add(right);
    if (keyboard.isPressed(pc.KEY_A)) dir.sub(right);

    var pos = this.entity.getPosition().clone();
    if (dir.lengthSq() > 0) {
        dir.normalize().scale(this.moveSpeed * dt);
        pos.x += dir.x;
        pos.z += dir.z;

        // Keep the character inside the room, a little short of the wall.
        var maxR = this.rimRadius - 3;
        var distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        if (distFromCenter > maxR) {
            var scale = maxR / distFromCenter;
            pos.x *= scale;
            pos.z *= scale;
        }
    }
    pos.y = this.eyeHeight;
    this.entity.setPosition(pos);
};
