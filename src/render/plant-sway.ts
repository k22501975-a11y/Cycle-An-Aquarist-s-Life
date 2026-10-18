import { MeshPlane, type Texture } from 'pixi.js';

/**
 * 水草隨水流搖擺（D4）：根部固定，越往上擺得越多，而且上面比下面慢半拍，
 * 看起來是水流一波波經過，不是整株僵硬地歪來歪去。
 *
 * hFrac：0 根部、1 頂端；phase：水流相位；amp：頂端最大位移（像素）。
 */
export function plantSway(hFrac: number, phase: number, amp: number): number {
  const h = Math.max(0, Math.min(1, hFrac));
  const bend = Math.pow(h, 1.6);
  return amp * bend * (Math.sin(phase - h * 1.3) + 0.25 * Math.sin(phase * 2.3 - h * 2.1 + 1));
}

const MESH_X = 4;
const MESH_Y = 8;

/** 一株水草的網格：貼圖不變時共用，換貼圖（長大、溶葉、長藻）時重建。 */
export class PlantMesh {
  readonly mesh: MeshPlane;
  private readonly rest: Float32Array;

  constructor(texture: Texture, anchorX: number, anchorY: number) {
    this.mesh = new MeshPlane({ texture, verticesX: MESH_X, verticesY: MESH_Y });
    this.mesh.position.set(-anchorX, -anchorY);
    this.rest = new Float32Array(this.mesh.geometry.getBuffer('aPosition').data);
  }

  sway(phase: number, amp: number): void {
    const h = this.mesh.texture.height;
    const buf = this.mesh.geometry.getBuffer('aPosition');
    const data = buf.data as Float32Array;
    for (let i = 0; i < this.rest.length; i += 2) {
      data[i] = this.rest[i] + plantSway(1 - this.rest[i + 1] / h, phase, amp);
    }
    buf.update();
  }

  destroy(): void {
    this.mesh.destroy({ texture: true, textureSource: true });
  }
}
