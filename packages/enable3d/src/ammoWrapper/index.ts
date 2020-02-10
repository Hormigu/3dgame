/**
 * @author       Yannick Deubel (https://github.com/yandeu)
 * @copyright    Copyright (c) 2019 Yannick Deubel; Project Url: https://github.com/yandeu/enable3d
 * @license      {@link https://github.com/yandeu/enable3d/blob/master/LICENSE|GNU GPLv3}
 */

import logger from '../helpers/logger'
import PhysicsBody from './physicsBody'
import ThreeGraphics from '../threeWrapper'
import {
  SphereConfig,
  GroundConfig,
  MaterialConfig,
  BoxConfig,
  CylinderConfig,
  ExtrudeConfig,
  Phaser3DConfig,
  AddExistingConfig,
  TorusConfig
} from '../types'
import applyMixins from '../helpers/applyMixins'
import ExtendedObject3D from '../threeWrapper/extendedObject3D'
import Shapes from './shapes'
import Constraints from './constraints'
import { Scene3D } from '..'
import Events from './events'
import EventEmitter from 'eventemitter3'
import Physics from './physics'
import { Vector3, Quaternion } from 'three'

interface AmmoPhysics extends Physics, Constraints, Shapes, Events {}

class AmmoPhysics extends EventEmitter {
  public tmpTrans: Ammo.btTransform
  protected rigidBodies: ExtendedObject3D[] = []
  protected objectsAmmo: { [ptr: number]: any } = {}
  protected earlierDetectedCollisions: { combinedName: string; collision: boolean }[] = []
  protected gravity: { x: number; y: number; z: number }

  constructor(protected phaser3D: ThreeGraphics, protected scene: Scene3D, public config: Phaser3DConfig = {}) {
    super()

    this.emptyV3 = new Vector3()
    this.impactPoint = new Vector3()
    this.impactNormal = new Vector3()

    this.gravity = config.gravity || { x: 0, y: -9.81, z: 0 }

    this.start()
  }

  public get debug() {
    return {
      enable: () => {
        this.debugDrawer.enable()
      },
      mode: (debugMode: number = 1) => {
        this.debugDrawer.setDebugMode(debugMode)
      },
      disable: () => {
        this.debugDrawer.disable()
      }
    }
  }

  private start() {
    if (typeof Ammo === 'undefined') {
      logger('Are you sure you included ammo.js?')
      return
    }

    if (typeof Ammo === 'function')
      Ammo().then(() => {
        this.setup()
      })
    else this.setup()
  }

  public get add() {
    return {
      collider: (
        object1: ExtendedObject3D,
        object2: ExtendedObject3D,
        eventCallback: (event: 'start' | 'collision' | 'end') => void
      ) => this.addCollider(object1, object2, eventCallback),
      constraints: this.addConstraints,
      existing: (object: ExtendedObject3D, config?: AddExistingConfig) => this.addExisting(object, config),
      sphere: (sphereConfig: SphereConfig = {}, materialConfig: MaterialConfig = {}) =>
        this.addSphere(sphereConfig, materialConfig),
      ground: (groundConfig: GroundConfig, materialConfig: MaterialConfig = {}) =>
        this.addGround({ ...groundConfig, mass: 0 }, materialConfig),
      box: (boxConfig: BoxConfig = {}, materialConfig: MaterialConfig = {}) => this.addBox(boxConfig, materialConfig),
      cylinder: (cylinderConfig: CylinderConfig = {}, materialConfig: MaterialConfig = {}) =>
        this.addCylinder(cylinderConfig, materialConfig),
      torus: (torusConfig: TorusConfig = {}, materialConfig: MaterialConfig = {}) =>
        this.addTorus(torusConfig, materialConfig),
      extrude: (extrudeConfig: ExtrudeConfig, materialConfig: MaterialConfig = {}) =>
        this.addExtrude(extrudeConfig, materialConfig)
    }
  }

  private addExisting(object: ExtendedObject3D, config: AddExistingConfig = {}): void {
    const { position: pos, quaternion: quat, hasBody } = object
    const { mass = 1, autoCenter = true, offset = undefined } = config

    let params = { width: 1, height: 1, depth: 1, radius: 0.5 }
    let shape = 'box'

    if (config.shape) {
      params = { ...params, ...config }
      shape = config.shape
    } else if (object.shape) {
      // @ts-ignore
      params = { ...params, ...object?.geometry?.parameters }
      shape = object.shape
    }

    const boxShape = () =>
      new Ammo.btBoxShape(new Ammo.btVector3(params.width / 2, params.height / 2, params.depth / 2))

    if (hasBody) {
      logger(`Object "${object.name}" already has a physical body!`)
      return
    }

    // auto adjust the center for custom shapes
    if (autoCenter && (shape === 'convex' || shape === 'concave')) object.geometry.center()

    let Shape

    switch (shape) {
      case 'box':
        Shape = boxShape()
        break
      case 'sphere':
        Shape = new Ammo.btSphereShape(params.radius)
        break
      case 'torus':
        Shape = this.addTorusShape(params, quat)
        break
      case 'convex':
        Shape = this.addTriMeshShape(object, config)
        break
      case 'concave':
        Shape = this.addTriMeshShape(object, config)
        break
      case 'hull':
        Shape = this.addHullShape(object, config)
        break
    }

    if (!Shape) {
      logger(`Could not recognize shape "${shape}"!`)
      return
    }

    Shape.setMargin(0.05)

    this.addRigidBody(object, Shape, mass, pos, quat)
    this.addBodyProperties(object, config)

    if (offset) object.body.offset = { x: 0, y: 0, z: 0, ...offset }
  }

  protected createRigidBody(physicsShape: any, mass: number, pos: Vector3, quat: Quaternion) {
    const transform = new Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
    transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w))
    const motionState = new Ammo.btDefaultMotionState(transform)
    const localInertia = new Ammo.btVector3(0, 0, 0)
    physicsShape.calculateLocalInertia(mass, localInertia)
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, physicsShape, localInertia)
    const rigidBody = new Ammo.btRigidBody(rbInfo)
    return rigidBody
  }

  protected addRigidBody(
    threeObject: ExtendedObject3D,
    physicsShape: any,
    mass: number,
    pos: Vector3,
    quat: Quaternion
  ) {
    threeObject.position.copy(pos)
    threeObject.quaternion.copy(quat)

    const rigidBody = this.createRigidBody(physicsShape, mass, pos, quat)

    if (mass > 0) {
      // Disable deactivation
      rigidBody.setActivationState(4)
    }

    this.rigidBodies.push(threeObject)
    this.physicsWorld.addRigidBody(rigidBody)

    const ptr = Object.values(rigidBody)[0]
    // @ts-ignore
    rigidBody.name = threeObject.name
    threeObject.body = new PhysicsBody(this, rigidBody)
    threeObject.hasBody = true
    // @ts-ignore
    threeObject.ptr = ptr
    this.objectsAmmo[ptr] = threeObject
  }
}

applyMixins(AmmoPhysics, [Physics, Constraints, Shapes, Events])

export default AmmoPhysics
