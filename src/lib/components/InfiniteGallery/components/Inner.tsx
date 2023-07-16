import type { VirtualItem } from "@tanstack/react-virtual";
import type { PhotoLayoutRow } from "../photoLayoutRow";
import { Row } from "./Row";
import cl from '../common.module.scss';

export type InnerProps = {
  height: number;
  virtualItems: VirtualItem[];
  layoutRows: PhotoLayoutRow[];
  paddingLeft: number;
  paddingTop: number;
  paddingBottom: number;
  gap: number;
  isLoading: boolean;
  isAllLoaded: boolean;
};

export function Inner(props: InnerProps) {
  const { height, virtualItems, layoutRows, paddingLeft, paddingTop, paddingBottom, gap, isLoading, isAllLoaded } = props;

  return (
    <>
      <div
        className={cl['list-inner']}
        style={{ height: `${height}px`, marginLeft: `${paddingLeft}px`, marginTop: `${paddingTop}px` }}
      >
        {
          virtualItems.map(virtualRow =>
            <Row
              key={virtualRow.index}
              layoutRow={layoutRows[virtualRow.index]}
              yOffset={virtualRow.start} height={virtualRow.size}
              gap={gap}
            />
          )
        }
      </div>
      {isLoading && <div>Загрузка дополнительных фоток...</div>}
      {isAllLoaded && <div style={{ height: paddingBottom }} />}
    </>
  );
}
