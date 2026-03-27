import React from "react";
import * as GQL from "src/core/generated-graphql";
import {
  useCardWidth,
  useContainerDimensions,
} from "../Shared/GridCard/GridCard";
import { LabelCard } from "./LabelCard";

interface ILabelCardGrid {
  labels: GQL.LabelDataFragment[];
  selectedIds: Set<string>;
  zoomIndex: number;
  onSelectChange: (id: string, selected: boolean, shiftKey: boolean) => void;
}

const zoomWidths = [280, 340, 420, 560];

export const LabelCardGrid: React.FC<ILabelCardGrid> = ({
  labels,
  selectedIds,
  zoomIndex,
  onSelectChange,
}) => {
  const [componentRef, { width: containerWidth }] = useContainerDimensions();
  const cardWidth = useCardWidth(containerWidth, zoomIndex, zoomWidths);

  return (
    <div className="row justify-content-center" ref={componentRef}>
      {labels.map((label) => (
        <LabelCard
          key={label.id}
          cardWidth={cardWidth}
          label={label}
          zoomIndex={zoomIndex}
          selecting={selectedIds.size > 0}
          selected={selectedIds.has(label.id)}
          onSelectedChanged={(selected: boolean, shiftKey: boolean) =>
            onSelectChange(label.id, selected, shiftKey)
          }
        />
      ))}
    </div>
  );
};
