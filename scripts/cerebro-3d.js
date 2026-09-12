var Cerebro3D = pc.createScript('cerebro3d');

Cerebro3D.attributes.add('radius', { type: 'number', default: 800, title: 'Raio alvo do cerebro' });
Cerebro3D.attributes.add('moveSpeed', { type: 'number', default: 180, title: 'Velocidade de voo' });
Cerebro3D.attributes.add('lookSpeed', { type: 'number', default: 0.2, title: 'Sensibilidade do mouse' });

Cerebro3D.prototype.initialize = function () {
    // Cap render resolution to 1x CSS pixels. On a HiDPI/scaled display
    // (e.g. Windows at 125-150%) leaving this uncapped renders every frame
    // at 1.5-2x more pixels than shown - the single biggest, easiest-to-miss
    // cause of "travando" on a giant, screen-filling, two-sided mesh.
    this.app.graphicsDevice.maxPixelRatio = 1;

    this.hideDefaultPrimitives();
    this.loadBrainModel();
    this.setupCamera();
    this.setupControls();
};

// The blank-project starter ships a small box + plane; hide them, they are
// meaningless at brain scale.
Cerebro3D.prototype.hideDefaultPrimitives = function () {
    var names = ['Caixa', 'Avião', 'Box', 'Plane', 'Luz', 'Light'];
    var self = this;
    names.forEach(function (n) {
        var e = self.app.root.findByName(n);
        if (e) e.enabled = false;
    });
};

// Uses a real brain model (imported from a downloaded glTF/GLB, CC-BY
// "Brain" by Poly by Google) instead of a procedural approximation, scaled
// up to a giant size and made hollow-viewable so the camera can sit inside.
Cerebro3D.prototype.loadBrainModel = function () {
    var asset = this.app.assets.find('brain.glb', 'model');
    if (!asset) {
        console.warn('cerebro3d: model asset "brain.glb" not found');
        return;
    }

    if (asset.resource) {
        this.onBrainAssetLoaded(asset);
    } else {
        asset.once('load', this.onBrainAssetLoaded, this);
        this.app.assets.load(asset);
    }
};

Cerebro3D.prototype.onBrainAssetLoaded = function (asset) {
    var brain = new pc.Entity('CerebroCasca');
    brain.addComponent('model', { type: 'asset', asset: asset });
    this.app.root.addChild(brain);
    this.brain = brain;

    var meshInstances = brain.model.meshInstances;

    // Scale the model up so it fills the target radius, regardless of the
    // source file's original real-world units.
    var aabb = new pc.BoundingBox();
    meshInstances.forEach(function (mi, i) {
        if (i === 0) aabb.copy(mi.aabb);
        else aabb.add(mi.aabb);
    });
    var maxExtent = Math.max(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z) || 1;
    var scale = this.radius / maxExtent;
    brain.setLocalScale(scale, scale, scale);

    // The source file's pivot isn't at its geometric center. aabb.center
    // was measured before this scale was applied (i.e. in local units), so
    // scale it too when computing how far to shift the entity so the
    // model's true center lands on world (0,0,0).
    brain.setPosition(-aabb.center.x * scale, -aabb.center.y * scale, -aabb.center.z * scale);

    // Hollow-viewable + cheap: fully unlit material. No per-pixel lighting,
    // no specular, no scene lights needed at all - just a flat warm tone on
    // both faces, visible from inside or out regardless of angle. This is
    // also what actually fixed the perf ("travando"): the previous lit
    // material was shading every pixel of a giant, screen-filling,
    // double-sided surface against 3 lights every frame.
    meshInstances.forEach(function (mi) {
        var mat = mi.material;
        mat.cull = pc.CULLFACE_NONE;
        mat.useLighting = false;
        mat.diffuse = new pc.Color(0, 0, 0);
        mat.emissive = new pc.Color(0.78, 0.42, 0.42);
        mat.update();
    });
};

Cerebro3D.prototype.setupCamera = function () {
    // This script is expected on the camera entity itself.
    this.entity.setPosition(0, 0, 0);
    this.entity.setEulerAngles(0, 0, 0);
    if (this.entity.camera) {
        this.entity.camera.farClip = this.radius * 6;
        this.entity.camera.nearClip = 0.1;
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
};
