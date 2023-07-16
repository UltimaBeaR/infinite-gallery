export interface Photo {
  urlSmall: string,
  widthSmall: number,
  heightSmall: number,

  urlLarge: string,
  widthLarge: number,
  heightLarge: number
}

export interface PhotosChunk {
  photos: Photo[],
  totalCount: number
}
