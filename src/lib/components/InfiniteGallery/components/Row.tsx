import type { PhotoLayoutRow } from "../photoLayoutRow";
import cl from '../common.module.scss';

export type RowProps = {
  layoutRow: PhotoLayoutRow;
  yOffset: number;
  height: number;
  gap: number;
};

export function Row(props: RowProps) {
  const { layoutRow, yOffset, height, gap } = props;

  const photoElements = layoutRow.items.map((item, photoIdx) => {
    return (
      <div
        key={photoIdx}
        className={cl['image-placeholder']}
        style={{
          width: item.width, height: layoutRow.height,
          marginRight: photoIdx < layoutRow.items.length - 1
            ? `${gap}px`
            : undefined
        }}
      >
        <img
          className={cl.image}
          src={item.url}
          width={item.width} height={layoutRow.height}
          alt="Фото"
        />
      </div>
    );
  });

  return (
    <div
      className={cl['row']}
      style={{
        height: `${height}px`,
        transform: `translateY(${yOffset}px)`
      }}
    >
      {photoElements}
    </div>
  );
}
