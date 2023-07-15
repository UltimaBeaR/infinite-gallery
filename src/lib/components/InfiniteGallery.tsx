
import useResizeObserver from "use-resize-observer";
import { InfiniteGalleryLowLvl, type PhotosChunk } from "@/lib/components/InfiniteGalleryLowLvl";
import {
  QueryClient,
  QueryClientProvider
} from 'react-query';

import cl from './InfiniteGallery.module.scss';

const queryClient = new QueryClient();

export type InfiniteGalleryProps = {
  getNextPhotosChunk(offset: number, limit: number): Promise<PhotosChunk>;

  minRowHeight?: number;
  maxRowHeight?: number;

  gap?: number;

  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
};

export function InfiniteGallery(props: InfiniteGalleryProps) {
  const resizeObserver = useResizeObserver<HTMLDivElement>()

  return (
    <div ref={resizeObserver.ref} className={cl.wrapper}>
      <QueryClientProvider client={queryClient}>
        <InfiniteGalleryLowLvl
          width={resizeObserver.width ?? 0}
          maxHeight={resizeObserver.height ?? 0}
          {...props}
        />
      </QueryClientProvider>
    </div>
  );
}
