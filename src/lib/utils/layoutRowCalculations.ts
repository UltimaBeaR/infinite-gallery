export interface LayoutRows {
  rows: LayoutRow[],
  lastRowIsIncomplete: boolean
}

export interface LayoutRow {
  widths: number[],
  height: number
}

export interface Size {
  width: number,
  height: number
}

enum ShrinkOrientation {
  Horizontal,
  Vertical
}

interface FitRowResult {
  case: FitRowResultCase,
  fitHeight: number,
  shrinkOrientation: ShrinkOrientation
}

enum FitRowResultCase {
  NeedsMoreBlocks,
  Fits,
  NeedsShrinking
}

interface LayoutRowBuilder {
  boxes: BuildingBox[]
}

interface BuildingBox {
  originalSize: Size
  initialVerticalShrinkSize: Size
  finalShrinkSize: Size | null
}

export function calculateLayout(
  boxes: Size[],
  areaWidth: number,
  rowMinHeight: number, rowMaxHeight: number,
  maxAspectRatio: number,
  gap: number
): LayoutRows {
  const rows: LayoutRow[] = [];

  const rowBuilder: LayoutRowBuilder = { boxes: [] };

  let boxIdx = 0;

  while (true) {
    if (boxIdx === boxes.length)
      break;

    const box = boxes[boxIdx];

    const buildingBox: BuildingBox = {
      originalSize: { width: box.width, height: box.height },
      initialVerticalShrinkSize: {
        width: box.width,
        height: box.height * _calcInitialVerticalShrink(box, maxAspectRatio)
      },
      finalShrinkSize: null
    };

    rowBuilder.boxes.push(buildingBox);

    const fitResult = _tryFitBoxesInRow(rowBuilder, areaWidth, rowMinHeight, rowMaxHeight, gap);

    if (fitResult.case === FitRowResultCase.Fits) {
      boxIdx++;

      _setFinalShrinkedWidthsFromInitial(rowBuilder, fitResult.fitHeight);

      rows.push(_buildRow(rowBuilder));
      rowBuilder.boxes.length = 0;
    }
    else if (fitResult.case === FitRowResultCase.NeedsShrinking) {
      if (fitResult.shrinkOrientation === ShrinkOrientation.Horizontal) {
        boxIdx++;

        // TODO: тут сделать спецэфичный (с весами) horizontal shrink если пойму как
        _shrinkLinearUniversal(rowBuilder, areaWidth, fitResult.fitHeight, gap);
      }
      else {
        // Удаляем последний добавленный бокс
        rowBuilder.boxes.pop();

        // TODO: тут сделать спецэфичный (с весами) vertical shrink если пойму как
        _shrinkLinearUniversal(rowBuilder, areaWidth, fitResult.fitHeight, gap);
      }

      rows.push(_buildRow(rowBuilder));
      rowBuilder.boxes.length = 0;
    }
    else {
      boxIdx++;
    }
  }

  for (let row of rows) {
    _makeRowPixelPerfect(row, areaWidth, gap);
  }

  const lastRowIsIncomplete = rowBuilder.boxes.length > 0;

  if (lastRowIsIncomplete) {
    // Это последняя незаполненная строка - ее не нужно делать pixel perfect, т.к. она гарантированно не доходит до границы

    _setFinalShrinkedWidthsFromInitial(rowBuilder, rowMaxHeight);

    rows.push(_buildRow(rowBuilder));
  }

  return {
    rows: rows,
    lastRowIsIncomplete: lastRowIsIncomplete
  };
}

function _tryFitBoxesInRow(rowBuilder: LayoutRowBuilder, areaWidth: number, rowMinHeight: number, rowMaxHeight: number, gap: number): FitRowResult {
  areaWidth -= _getTotalRowGap(rowBuilder.boxes.length, gap);

  let totalWidthForRowMinHeight = 0;
  let totalWidthForRowMaxHeight = 0;

  let lastBoxWidthForRowMinHeight: number;
  let lastBoxWidthForRowMaxHeight = 0;

  for (let box of rowBuilder.boxes) {
    lastBoxWidthForRowMinHeight = _adaptBoxWidthForTargetHeight(box.initialVerticalShrinkSize.width, box.initialVerticalShrinkSize.height, rowMinHeight);
    lastBoxWidthForRowMaxHeight = _adaptBoxWidthForTargetHeight(box.initialVerticalShrinkSize.width, box.initialVerticalShrinkSize.height, rowMaxHeight);

    totalWidthForRowMinHeight += lastBoxWidthForRowMinHeight;
    totalWidthForRowMaxHeight += lastBoxWidthForRowMaxHeight;
  }

  if (totalWidthForRowMaxHeight < areaWidth) {
    return {
      case: FitRowResultCase.NeedsMoreBlocks,
      fitHeight: 0,
      shrinkOrientation: ShrinkOrientation.Horizontal
    };
  }

  if (totalWidthForRowMinHeight > areaWidth) {
    const result: FitRowResult = {
      case: FitRowResultCase.NeedsShrinking,
      fitHeight: 0,
      shrinkOrientation: ShrinkOrientation.Horizontal
    };

    if (rowBuilder.boxes.length === 1) {
      result.shrinkOrientation = ShrinkOrientation.Horizontal;
    }
    else {
      // Максимально возможная ширина строки без учета последнего бокса
      const totalWidthForRowMaxHeightWithoutLastBox = totalWidthForRowMaxHeight - lastBoxWidthForRowMaxHeight;

      const lackOfWidthPercentOfRow = 1.0 - (totalWidthForRowMaxHeightWithoutLastBox / areaWidth);

      if (lackOfWidthPercentOfRow > 0.4) {
        // Недопускаем ситуацию когда остается очень много свободного места - это значит что
        // последний бокс довольно длинный и лучше уж его обрезать по ширине чем оставить столько свободного места и обрезать много картинок
        // очень сильно по высоте
        result.shrinkOrientation = ShrinkOrientation.Horizontal;
      }
      else {
        // Минимально возможный недостаток ширины, в случае если убираем последний бокс
        const lackOfWidth = areaWidth - totalWidthForRowMaxHeightWithoutLastBox;

        // Минимально возможный излишек ширины, в случае если оставляем последний бокс
        const excessWidth = totalWidthForRowMinHeight - areaWidth;

        // Если в случае если убрать последний бокс - будет недоставать очень много места (больше чем излишек, если добавлять бокс)
        // - то значит бокс все таки нужно добавить и уменьшить полученную строку горизонтально.
        // Если же недостаток небольшой большой, а избыток очень большой, то стоит убрать последний бокс
        // и уменьшить строки вертикально (в этом случае при подстраивании под высоту ширина строки увеличится и заполнит недостаток, который небольшой)
        result.shrinkOrientation = lackOfWidth > excessWidth
          ? ShrinkOrientation.Horizontal
          : ShrinkOrientation.Vertical;
      }
    }

    result.fitHeight = result.shrinkOrientation === ShrinkOrientation.Horizontal
      ? rowMinHeight
      : rowMaxHeight;

    return result;
  }
  else {
    const percent = (areaWidth - totalWidthForRowMinHeight) / (totalWidthForRowMaxHeight - totalWidthForRowMinHeight);
    let fitHeight = rowMinHeight + ((rowMaxHeight - rowMinHeight) * percent);

    if (fitHeight < rowMinHeight)
      fitHeight = rowMinHeight;

    if (fitHeight > rowMaxHeight)
      fitHeight = rowMaxHeight;

    return {
      case: FitRowResultCase.Fits,
      fitHeight: fitHeight,
      shrinkOrientation: ShrinkOrientation.Horizontal
    };
  }
}

function _shrinkLinearUniversal(rowBuilder: LayoutRowBuilder, areaWidth: number, rowHeight: number, gap: number) {
  areaWidth -= _getTotalRowGap(rowBuilder.boxes.length, gap);

  const widths = _calcAdaptedWidths(rowBuilder, rowHeight);

  const coef = areaWidth / widths.reduce((accumulator, curr) => accumulator + curr, 0);

  for (let boxIdx = 0; boxIdx < rowBuilder.boxes.length; boxIdx++) {
    rowBuilder.boxes[boxIdx].finalShrinkSize = { width: widths[boxIdx] * coef, height: rowHeight };
  }
}

function _setFinalShrinkedWidthsFromInitial(rowBuilder: LayoutRowBuilder, rowHeight: number) {
  const finalShrinkSizes = _calcAdaptedWidths(rowBuilder, rowHeight)
    .map(x => ({ width: x, height: rowHeight }) as Size);

  for (let i = 0; i < rowBuilder.boxes.length; i++) {
    rowBuilder.boxes[i].finalShrinkSize = finalShrinkSizes[i];
  }
}

function _buildRow(rowBuilder: LayoutRowBuilder): LayoutRow {
  return {
    height: Math.round(rowBuilder.boxes.length > 0 ? rowBuilder.boxes[0].finalShrinkSize!.height : 0),
    widths: rowBuilder.boxes.map(x => Math.round(x.finalShrinkSize!.width))
  };
}

function _makeRowPixelPerfect(row: LayoutRow, areaWidth: number, gap: number) {
  areaWidth -= _getTotalRowGap(row.widths.length, gap);

  while (true) {
    const currentAreaWidth = row.widths.reduce((accumulator, curr) => accumulator + curr, 0);

    if (currentAreaWidth < areaWidth) {
      const minWidth = Math.min(...row.widths);

      const rowIdx = row.widths.indexOf(minWidth);

      row.widths[rowIdx]++;
    }
    else if (currentAreaWidth > areaWidth) {
      const maxWidth = Math.max(...row.widths);

      const rowIdx = row.widths.indexOf(maxWidth);

      row.widths[rowIdx]--;
    }
    else
      break;
  }
}

function _calcAdaptedWidths(rowBuilder: LayoutRowBuilder, rowHeight: number): number[] {
  return rowBuilder.boxes
    .map(x => _adaptBoxWidthForTargetHeight(x.initialVerticalShrinkSize.width, x.initialVerticalShrinkSize.height, rowHeight));
}

function _adaptBoxWidthForTargetHeight(boxWidth: number, boxHeight: number, targetHeight: number): number {
  return (targetHeight / boxHeight) * boxWidth;
}

function _calcInitialVerticalShrink(box: Size, maxAspectRatio: number): number {
  if (box.width >= box.height)
    return 1;

  const verticalStretchingCoef = box.height / box.width;

  if (verticalStretchingCoef <= maxAspectRatio)
    return 1;

  const newHeight = maxAspectRatio * box.width;

  return newHeight / box.height;
}

function _getTotalRowGap(boxesInRowCount: number, gap: number): number {
  return (boxesInRowCount - 1) * gap;
}
