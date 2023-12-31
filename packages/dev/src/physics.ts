import {
  Scene,
  Color,
  PerspectiveCamera,
  WebGLRenderer,
  HemisphereLight,
  AmbientLight,
  DirectionalLight,
  Clock
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { AmmoPhysics, ExtendedMesh, ExtendedObject3D, PhysicsLoader } from '@enable3d/ammo-physics'

const MainScene = () => {
  // scene
  const scene = new Scene()
  scene.background = new Color(0xf0f0f0)

  // camera
  const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(10, 10, 20)
  camera.lookAt(0, 0, 0)

  // renderer
  const renderer = new WebGLRenderer()
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)

  // dpr
  const DPR = window.devicePixelRatio
  renderer.setPixelRatio(Math.min(2, DPR))

  // orbit controls
  const controls = new OrbitControls(camera, renderer.domElement)

  // light
  scene.add(new HemisphereLight(0xffffbb, 0x080820, 1))
  scene.add(new AmbientLight(0x666666))
  const light = new DirectionalLight(0xdfebff, 1)
  light.position.set(50, 200, 100)
  light.position.multiplyScalar(1.3)

  // physics
  const physics = new AmmoPhysics(scene)
  physics.debug?.enable()
  const { factory } = physics

  // add ground
  physics.add.ground({ width: 50, height: 50 })

  /**
   * Add your objects below here
   */
  physics.add.box({ y: 10 }, { lambert: { color: 'red' } })

  // clock
  const clock = new Clock()

  // loop
  const animate = () => {
    physics.update(clock.getDelta() * 1000)
    physics.updateDebugger()

    renderer.render(scene, camera)

    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)
}

const startPhysics = () => {
  PhysicsLoader('/lib', () => MainScene())
}

export default startPhysics
