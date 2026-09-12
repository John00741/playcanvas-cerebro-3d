var Cerebro3D = pc.createScript('cerebro3d');

Cerebro3D.attributes.add('domeRadius', { type: 'number', default: 130, title: 'Curvatura do domo (teto/paredes)' });
Cerebro3D.attributes.add('domeAngleDeg', { type: 'number', default: 100, title: 'Ate onde o domo desce (>90 = paredes encurvam pro chao)' });
Cerebro3D.attributes.add('moveSpeed', { type: 'number', default: 30, title: 'Velocidade de caminhada' });
Cerebro3D.attributes.add('lookSpeed', { type: 'number', default: 0.2, title: 'Sensibilidade do mouse' });
Cerebro3D.attributes.add('eyeHeight', { type: 'number', default: 1.8, title: 'Altura dos olhos do personagem' });

Cerebro3D.prototype.initialize = function () {
    // Cap render resolution to 1x CSS pixels - the earlier "travando" was
    // fixed by this + the unlit material below (per-pixel lighting on a
    // giant, screen-filling, two-sided surface every frame was the cost).
    this.app.graphicsDevice.maxPixelRatio = 1;

    this.hideDefaultPrimitives();
    this.buildRoom();
    this.loadBrainCenterpiece();
    this.setupCamera();
    this.setupControls();
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
