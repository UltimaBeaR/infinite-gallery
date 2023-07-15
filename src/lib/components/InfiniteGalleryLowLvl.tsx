/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useQuery } from 'react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import uniqueId from 'lodash-es/uniqueId';
import { calculateLayout, type Size } from '@/lib/utils/layoutRowCalculations';
import { useDebounced } from '@/lib/hooks/useDebounced';

import SimpleBar from "simplebar-react";
import 'simplebar-react/dist/simplebar.min.css';

import cl from './InfiniteGalleryLowLvl.module.scss';

// TODO: Нужно сделать чтобы при наведении мышки - фотка на которую навелись рисовалась как бы приподнятой над остальными (выходит на передний план, с плавной анимацией)
// (кст. при открытии попапа с фуллскрин фоткой тоже можно какую то анимацию замутить транслейта из мелкой фотки в большую. И в большом просмотрщике, пока грузится большая фотка, можно показывать маленькую)
// - так вот она когда приподнимается - она рисуется всегда необрезанной, даже если мой лейаут ее обрезал. Но т.к. она приподнимается над остальными - то ее видно.
// мышка при этом при наведении должна игнорировать приподнятую фотку а наводиться именно на бэкграунд, чтобы не было такого что при наведении на фотку которую перекрыла эта поднявшаяся нужно было
// обходить мышкой эту поднятую фотку чтобы выбрать другую.
//
// Также должна быть возможность на фотках ставить "лайки" (не в вк а локально в своей проге) чтобы они вперед выносились в списке при следующем просмотре фоток.
// так что думаю тут нужно вообще вынести наружу из этого компонента рендер-код для отдельной картинки. Через children возможно сделать


// TODO: нужно подвязать размерности (width) на систему брейкпоинтов.
// изначально в компонент передавать настройки брейкпоинтов, тогда при построении layout-а,
// будет сразу на все эти брейкпоинты расчитываться разметка галереи и тогда при изменении ширины
// будут аплаится размерности из соответствущего массива с брейкпоинтами.
// То есть на данный момент есть только один массив - layoutRows, а будет их несколько на каждый брейкпоинт возможный.
// Тогда при изменении размерностей не надо будет пересчитывать в этот момент огромный список фоток потенциальный - а просто переключается
// массив используемый с размерностями + делается что то типа "перейти по скроллу к элементу номер такому то" - чтобы сохранить положение фотки внутри скролла.
// можно сохранять оффсет фотки (1ой например) которая находится в видимости вьюпорта и считать % этого оффсета отностиельно высоты вьюпорта. И после изменения брейкпоинта
// переходить на такие же параметры - ту же фотку делать 1ой во вьюпорте и двигать на тот же %.

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

export type InfiniteGalleryLowLvlProps = {
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

export function InfiniteGalleryLowLvl(props: InfiniteGalleryLowLvlProps) {
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

  const parentRef = useRef<HTMLElement>(null);

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
      <div
        className={cl['list-inner']}
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, marginLeft: `${paddingLeft}px`, marginTop: `${paddingTop}px` }}
      >
        {
          virtualItems.map(virtualRow => {
            const layoutRow = layoutRows[virtualRow.index];

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
                key={virtualRow.index}
                className={cl['row']}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {photoElements}
              </div>
            );
          })
        }
      </div>
      {isLoading && <div>Загрузка дополнительных фоток...</div>}
      {isAllLoaded && <div style={{ height: paddingBottom }} />}
    </SimpleBar>
  );
}

interface PhotoLayoutRowItem {
  width: number,
  url: string
}

interface PhotoLayoutRow {
  items: PhotoLayoutRowItem[],
  height: number
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
