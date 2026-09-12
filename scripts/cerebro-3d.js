var Cerebro3D = pc.createScript('cerebro3d');

Cerebro3D.attributes.add('radius', { type: 'number', default: 40, title: 'Raio do cerebro' });
Cerebro3D.attributes.add('moveSpeed', { type: 'number', default: 18, title: 'Velocidade de voo' });
Cerebro3D.attributes.add('lookSpeed', { type: 'number', default: 0.2, title: 'Sensibilidade do mouse' });

Cerebro3D.prototype.initialize = function () {
    this.hideDefaultPrimitives();
    this.buildBrainShell();
    this.buildCoreLight();
    this.setupCamera();
    this.setupControls();
};

// The blank-project starter ships a small box + plane; hide them, they are
// meaningless at brain scale.
Cerebro3D.prototype.hideDefaultPrimitives = function () {
    var names = ['Caixa', 'Avião', 'Box', 'Plane'];
    var self = this;
    names.forEach(function (n) {
        var e = self.app.root.findByName(n);
        if (e) e.enabled = false;
    });
};

// Layered sine/cosine displacement over a UV-sphere: cheap, dependency-free
// stand-in for cortical folds (gyri/sulci) - stylised on purpose, matching
// the project's "didactic, not anatomically literal" brief.
Cerebro3D.prototype.wrinkleAt = function (theta, phi) {
    return (
        0.22 * Math.sin(6 * theta) * Math.cos(5 * phi) +
        0.14 * Math.sin(11 * theta + 1.7) * Math.cos(9 * phi + 0.6) +
        0.09 * Math.sin(17 * phi) * Math.cos(13 * theta + 2.1) +
        0.06 * Math.sin(23 * theta * phi * 0.02)
    );
};

Cerebro3D.prototype.buildBrainShell = function () {
    var latSegments = 90;
    var lonSegments = 140;
    var positions = [];
    var normals = [];
    var uvs = [];
    var colors = [];
    var indices = [];

    // Base tissue tones: deep valley (sulcus) vs. raised ridge (gyrus).
    var valley = new pc.Color(0.32, 0.09, 0.14);
    var ridge = new pc.Color(0.92, 0.62, 0.6);

    for (var lat = 0; lat <= latSegments; lat++) {
        var theta = (lat / latSegments) * Math.PI; // 0..PI
        for (var lon = 0; lon <= lonSegments; lon++) {
            var phi = (lon / lonSegments) * Math.PI * 2; // 0..2PI

            var wrinkle = this.wrinkleAt(theta, phi);
            var r = this.radius * (1 + wrinkle);
            var sinTheta = Math.sin(theta);
            var x = r * sinTheta * Math.cos(phi);
            var y = r * Math.cos(theta);
            var z = r * sinTheta * Math.sin(phi);

            positions.push(x, y, z);

            // Inward-pointing normal (negative of the outward radial dir)
            // so lighting reads correctly when viewed from inside the shell.
            var len = Math.sqrt(x * x + y * y + z * z) || 1;
            normals.push(-x / len, -y / len, -z / len);

            uvs.push(lon / lonSegments, lat / latSegments);

            // Map wrinkle (~ -0.5..0.5) to a valley/ridge tint so folds read
            // clearly regardless of viewing angle or light falloff.
            var t = pc.math.clamp(wrinkle * 2.2 + 0.5, 0, 1);
            colors.push(
                pc.math.lerp(valley.r, ridge.r, t),
                pc.math.lerp(valley.g, ridge.g, t),
                pc.math.lerp(valley.b, ridge.b, t),
                1
            );
        }
    }

    var rowSize = lonSegments + 1;
    for (lat = 0; lat < latSegments; lat++) {
        for (lon = 0; lon < lonSegments; lon++) {
            var a = lat * rowSize + lon;
            var b = a + rowSize;
            var c = a + 1;
            var d = b + 1;
            // Reversed winding (relative to a standard outward sphere) so
            // the faces are front-facing when seen from inside the shell.
            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, uvs);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);

    var material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(1, 1, 1);
    material.diffuseVertexColor = true;
    material.emissive = new pc.Color(0.12, 0.04, 0.06);
    material.emissiveVertexColor = true;
    material.shininess = 10;
    material.cull = pc.CULLFACE_NONE;
    material.twoSidedLighting = true;
    material.update();
    this.shellMaterial = material;

    var meshInstance = new pc.MeshInstance(mesh, material);
    var brain = new pc.Entity('CerebroCasca');
    brain.addComponent('render', { meshInstances: [meshInstance] });
    this.app.root.addChild(brain);
    this.brain = brain;
};

Cerebro3D.prototype.buildCoreLight = function () {
    var core = new pc.Entity('NucleoLuminoso');
    core.addComponent('light', {
        type: 'omni',
        color: new pc.Color(1, 0.75, 0.5),
        intensity: 2.4,
        range: this.radius * 2.2
    });
    core.setPosition(0, 0, 0);
    this.app.root.addChild(core);
    this.coreLight = core;

    var ambient = new pc.Entity('LuzAmbiente');
    ambient.addComponent('light', {
        type: 'omni',
        color: new pc.Color(0.5, 0.35, 0.6),
        intensity: 0.9,
        range: this.radius * 3
    });
    ambient.setPosition(this.radius * 0.3, this.radius * 0.2, -this.radius * 0.3);
    this.app.root.addChild(ambient);
};

Cerebro3D.prototype.setupCamera = function () {
    // This script is expected on the camera entity itself.
    this.entity.setPosition(0, 0, 0);
    this.entity.setEulerAngles(0, 0, 0);
    if (this.entity.camera) {
        this.entity.camera.farClip = this.radius * 6;
        this.entity.camera.nearClip = 0.05;
        this.entity.camera.clearColor = new pc.Color(0.03, 0.01, 0.02);
    }
    this.yaw = 0;
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
        self.pitch = pc.math.clamp(self.pitch, -89, 89);
        self.entity.setEulerAngles(self.pitch, self.yaw, 0);
    });

    this.app.mouse.disableContextMenu();
};

Cerebro3D.prototype.update = function (dt) {
    var keyboard = this.app.keyboard;
    var dir = new pc.Vec3();

    if (keyboard.isPressed(pc.KEY_W) || keyboard.isPressed(pc.KEY_UP)) dir.add(this.entity.forward);
    if (keyboard.isPressed(pc.KEY_S) || keyboard.isPressed(pc.KEY_DOWN)) dir.sub(this.entity.forward);
    if (keyboard.isPressed(pc.KEY_D)) dir.add(this.entity.right);
    if (keyboard.isPressed(pc.KEY_A)) dir.sub(this.entity.right);
    if (keyboard.isPressed(pc.KEY_SPACE)) dir.y += 1;
    if (keyboard.isPressed(pc.KEY_SHIFT)) dir.y -= 1;

    if (dir.lengthSq() > 0) {
        dir.normalize().scale(this.moveSpeed * dt);
        this.entity.setPosition(this.entity.getPosition().clone().add(dir));
    }

    // Slow pulsing glow on the core, echoing the "living organ" feel.
    if (this.coreLight) {
        var pulse = 2.4 + Math.sin(Date.now() * 0.0015) * 0.6;
        this.coreLight.light.intensity = pulse;
    }
};
