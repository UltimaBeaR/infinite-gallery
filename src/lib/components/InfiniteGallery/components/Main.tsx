/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useQuery } from 'react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import uniqueId from 'lodash-es/uniqueId';
import { calculateLayout, type Size } from '@/lib/utils/layoutRowCalculations';
import { useDebounced } from '@/lib/hooks/useDebounced';

import SimpleBar from "simplebar-react";
import 'simplebar-react/dist/simplebar.min.css';

import cl from '../common.module.scss';
import type { Photo, PhotosChunk } from '../photosChunk';
import { Inner } from './Inner';
import type { PhotoLayoutRow } from '../photoLayoutRow';

export type MainProps = {
  getNextPhotosChunk(offset: number, limit: number): Promise<PhotosChunk>;

  width: number;
  maxHeight: number;

  minRowHeight?: number;
  maxRowHeight?: number;

  gap?: number;

  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
};

export function Main(props: MainProps) {
  const {
    getNextPhotosChunk,

    width,
    maxHeight,

    minRowHeight = 200,
    maxRowHeight = 300,

    gap = 5,

    paddingLeft = 0,
    paddingRight = 0,
    paddingTop = 0,
    paddingBottom = 0
  } = props;

  const [totalCount, setTotalCount] = useState(0);

  const [layoutRows, setLayoutRows] = useState<PhotoLayoutRow[]>([]);
  const [incompleteRow, setIncompleteRow] = useState<Photo[]>([]);

  const [loadedPhotoCount, setLoadedPhotoCount] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState<Photo[]>([]);

  const [isAllLoaded, setIsAllLoaded] = useState(false);
  const [loadedChunksCount, setLoadedChunksCount] = useState(0);
  const [renderingWidth, setRenderingWidth] = useState(width);

  const [wasInitialized, setWasInitialized] = useState(false);

  const [isLayoutRebuilding, setIsLayoutRebuilding] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const [uniqueQueryKey] = useState(uniqueId('photo-gallery-'));

  const { refetch, isLoading } = useQuery(
    [uniqueQueryKey, loadedPhotoCount],
    () => getNextPhotosChunk(loadedPhotoCount, calcPhotosToRequestCount()),
    {
      enabled: false,
      onSuccess: handleNewPhotoChunk
    }
  );

  const rowVirtualizer = useVirtualizer({
    count: layoutRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => layoutRows[index].height + (index < layoutRows.length - 1 ? gap : 0),
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const rebuildLayout = useDebounced((width: number) => {
    addNewPhotos(loadedPhotos, width, isAllLoaded);

    setIsLayoutRebuilding(false);
  }, 400);

  useLayoutEffect(() => {
    if ((!wasInitialized && width !== 0) || (wasInitialized && width !== renderingWidth)) {
      setRenderingWidth(width);

      if (wasInitialized) {
        setIsLayoutRebuilding(true);
        setLayoutRows([]);
        rebuildLayout(width);
      }
      else {
        refetch();
      }

      if (!wasInitialized) {
        setWasInitialized(true);
      }
    }

  }, [width]);

  useEffect(() => {
    if (isAllLoaded || isLoading) {
      return;
    }

    if (virtualItems.length === 0) {
      return;
    }

    const lastItem = virtualItems[virtualItems.length - 1];

    if (!lastItem) {
      return;
    }

    const doRefetch =
      (loadedChunksCount > 1 && (lastItem.index + 5) >= layoutRows.length - 1) ||
      (loadedChunksCount <= 1 && lastItem.index >= layoutRows.length - 1);

    if (doRefetch) {
      refetch();
    }
  }, [loadedPhotoCount, virtualItems, isLoading, isAllLoaded]);

  function calcPhotosToRequestCount(): number {
    const averageRowCount = maxHeight / ((minRowHeight + maxRowHeight) / 2);
    const averagePhotosPerRow = 4;

    if (loadedChunksCount > 1) {
      // На третий раз и далее - то есть если юзер активно скролит и скорее всего дойдет до конца списка
      // - берем сразу много фоток, чтобы юзер не ждал постоянно подгрузки, т.к. могут быть задержки
      return Math.max(1, Math.round((averageRowCount * averagePhotosPerRow) * 5));
    }

    if (loadedChunksCount === 1) {
      // На второй раз (первый скроллинг, или если неповезло на первый раз заполнить пространство - то до скроллинга) берем 2 экрана
      return Math.max(1, Math.round((averageRowCount * averagePhotosPerRow) * 2));
    }

    // На первый раз грузим кол-во фоток чтобы заполнить все видимое пространство.
    // Добавляем несколько дополнительных строк, чтобы не триггерить запрос следующего чанка по скроллу.
    return Math.max(1, Math.round(averageRowCount + 7) * averagePhotosPerRow);
  }

  function handleNewPhotoChunk(photosChunk: PhotosChunk) {
    setLoadedChunksCount(old => old + 1);

    setLoadedPhotoCount(old => old + photosChunk.photos.length);
    setLoadedPhotos(old => [...old, ...photosChunk.photos]);

    if (totalCount === 0) {
      setTotalCount(photosChunk.totalCount);
    }

    const isAllLoaded = loadedPhotoCount + photosChunk.photos.length === photosChunk.totalCount;

    setIsAllLoaded(isAllLoaded);

    addNewPhotos([
      ...incompleteRow,
      ...photosChunk.photos
    ], renderingWidth, isAllLoaded);
  };

  function addNewPhotos(photos: Photo[], renderingWidth: number, isAllLoaded: boolean) {
    const areaWidth = renderingWidth - (paddingLeft + paddingRight);

    const layout = calculateLayout(
      photos.map(x => ({
        width: x.widthLarge,
        height: x.heightLarge
      }) as Size),
      areaWidth,
      minRowHeight, maxRowHeight,
      1.6,
      gap
    );

    const doTakeLastRow = isAllLoaded || !layout.lastRowIsIncomplete;

    const photoLayout: PhotoLayoutRow[] = [];

    let photoIdx = 0;

    for (let rowIdx = 0; rowIdx < layout.rows.length - (doTakeLastRow ? 0 : 1); rowIdx++) {
      const row = layout.rows[rowIdx];

      const photoLayoutRow = {
        height: row.height,
        items: []
      } as PhotoLayoutRow;

      for (let width of row.widths) {
        const photo = photos[photoIdx];

        const isSmallFitsBetter = checkIfFirstPhotoFitsBetter(
          width, photoLayoutRow.height,
          photo.widthSmall, photo.heightSmall,
          photo.widthLarge, photo.heightLarge,
        );

        photoLayoutRow.items.push({
          url: isSmallFitsBetter ? photo.urlSmall : photo.urlLarge,
          width: width
        });

        photoIdx++;
      }

      photoLayout.push(photoLayoutRow);
    }

    setLayoutRows(old => [...old, ...photoLayout]);
    setIncompleteRow(doTakeLastRow ? [] : photos.slice(photoIdx));
  }

  if (layoutRows.length === 0) {
    if (isLayoutRebuilding || isLoading) {
      return (
        <div className={cl['content-placeholder']}>
          Загрузка...
        </div>
      );
    }
    else {
      return (
        <div className={cl['content-placeholder']}>
          Нет фото
        </div>
      );
    }
  }

  return (
    <SimpleBar
      scrollableNodeProps={{ ref: parentRef, style: { willChange: 'transform' } }}
      className={cl['list-outer']}
      style={{ maxHeight: `${maxHeight}px` }}
    >
      {/* <div ref={parentRef} className={cl['list-outer']} style={{ willChange: 'transform', maxHeight: `${maxHeight}px` }}> */}
        <Inner
          height={rowVirtualizer.getTotalSize()}
          virtualItems={virtualItems}
          layoutRows={layoutRows}
          paddingLeft={paddingLeft} paddingTop={paddingTop} paddingBottom={paddingBottom}
          gap={gap}
          isLoading={isLoading}
          isAllLoaded={isAllLoaded}
        />
      {/* </div> */}
    </SimpleBar>
  );
}

function checkIfFirstPhotoFitsBetter(
  targetWidth: number, targetHeight: number,
  firstWidth: number, firstHeight: number,
  secondWidth: number, secondHeight: number
): boolean {
  const targetSquare = targetWidth * targetHeight;
  const firstSquare = firstWidth * firstHeight;
  const secondSquare = secondWidth * secondHeight;

  const firstDistance = Math.abs(targetSquare - firstSquare);
  const secondDistance = Math.abs(targetSquare - secondSquare);

  return firstDistance < secondDistance;
}
