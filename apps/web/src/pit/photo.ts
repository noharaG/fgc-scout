/**
 * 撮った写真を送れる大きさへ落とす。
 *
 * **端末側で縮小してから送る。**会場の Wi-Fi に原寸（4MB前後）を流すと、
 * 1枚あたり数十秒かかって記録が止まる。保存先の D1 も1行 2MB までなので、
 * 原寸のままでは入らない(→ 0005_pit_photo.sql)。
 *
 * ここで JPEG へ焼き直すので、**iPhone の HEIC もこの時点で消える**
 * (→ 要件定義書 F7-5)。Safari は HEIC を描画できるので、canvas を通せば
 * そのまま JPEG になる。
 */

/** 長辺の上限。機体の形と機構が見分けられれば足りる。 */
const MAX_EDGE = 1280

/** JPEG の品質。0.8 で 1280px の機体写真が 150KB 前後に収まる。 */
const QUALITY = 0.8

export type ShrunkPhoto = {
  readonly blob: Blob
  readonly width: number
  readonly height: number
  /** 画面に出すための URL。使い終わったら revoke する。 */
  readonly previewUrl: string
}

function scaledSize(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height)
  if (longest <= MAX_EDGE) return { width, height }
  const ratio = MAX_EDGE / longest
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

type Source = {
  readonly image: CanvasImageSource
  readonly width: number
  readonly height: number
  readonly close: () => void
}

/**
 * 向きを直してから読む。
 *
 * **iPhone は縦で撮っても画素は横向きに保存し、「回して表示せよ」という
 * 指示（EXIF の Orientation）を別に持つ。**これを無視すると、縦で撮った
 * 機体写真が全部横倒しで保存される。`createImageBitmap` に
 * `imageOrientation: "from-image"` を渡すと、仕様として向きを直した
 * ビットマップが返る。`<img>` 経由はブラウザ既定の解釈に委ねることになる
 * ので使わない。
 *
 * 古い実装系のために `<img>` の経路も残す。そちらは向きが直らないことが
 * あるが、読めないよりはよい。
 */
async function loadSource(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      })
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => {
          bitmap.close()
        },
      }
    } catch {
      // ここで諦めない。**iPhone の HEIC を createImageBitmap が受けない
      // 場合でも、Safari は `<img>` なら HEIC を描ける。**落とすと
      // 「読み込めませんでした」になって1枚失う。
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => {
      resolve()
    })
    image.addEventListener("error", () => {
      reject(new Error("decode"))
    })
    image.src = url
  })
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => {
      URL.revokeObjectURL(url)
    },
  }
}

/**
 * 1枚を縮小する。読めない形式なら例外を投げる。呼び出し側がその1枚だけを
 * 落として、残りは通す。1枚のせいで全部が保存できないほうが困る。
 */
export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  const source = await loadSource(file)
  try {
    const size = scaledSize(source.width, source.height)

    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext("2d")
    if (context === null) throw new Error("canvas")
    context.drawImage(source.image, 0, 0, size.width, size.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    })
    if (blob === null) throw new Error("encode")

    return {
      blob,
      width: size.width,
      height: size.height,
      previewUrl: URL.createObjectURL(blob),
    }
  } finally {
    source.close()
  }
}
