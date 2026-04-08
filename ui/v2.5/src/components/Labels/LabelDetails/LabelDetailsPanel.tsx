import React from "react";
import { TagLink } from "src/components/Shared/TagLink";
import * as GQL from "src/core/generated-graphql";
import { DetailItem } from "src/components/Shared/DetailItem";
import { StashIDPill } from "src/components/Shared/StashID";
import { Link } from "react-router-dom";

interface ILabelDetailsPanel {
  label: GQL.LabelDataFragment;
  collapsed?: boolean;
  fullWidth?: boolean;
}

export const LabelDetailsPanel: React.FC<ILabelDetailsPanel> = ({
  label,
  fullWidth,
}) => {
  function renderTagsField() {
    if (!label.tags.length) {
      return;
    }
    return (
      <ul className="pl-0">
        {(label.tags ?? []).map((tag) => (
          <TagLink key={tag.id} linkType="scene" tag={tag} />
        ))}
      </ul>
    );
  }

  function renderStashIDs() {
    if (!label.stash_ids?.length) {
      return;
    }

    return (
      <ul className="pl-0">
        {label.stash_ids.map((stashID) => {
          return (
            <li key={stashID.stash_id} className="row no-gutters">
              <StashIDPill stashID={stashID} linkType="labels" />
            </li>
          );
        })}
      </ul>
    );
  }

  function renderURLs() {
    if (!label.urls?.length) {
      return;
    }

    return (
      <ul className="pl-0">
        {label.urls.map((url: string) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="detail-group">
      <DetailItem id="details" value={label.details} fullWidth={fullWidth} />
      <DetailItem id="urls" value={renderURLs()} fullWidth={fullWidth} />
      <DetailItem
        id="studio"
        value={
          label.studio?.name ? (
            <Link to={`/studios/${label.studio?.id}`}>
              {label.studio.name}
            </Link>
          ) : (
            ""
          )
        }
        fullWidth={fullWidth}
      />
      <DetailItem id="tags" value={renderTagsField()} fullWidth={fullWidth} />
      <DetailItem
        id="stash_ids"
        value={renderStashIDs()}
        fullWidth={fullWidth}
      />
    </div>
  );
};

export const CompressedLabelDetailsPanel: React.FC<ILabelDetailsPanel> = ({
  label,
}) => {
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="sticky detail-header">
      <div className="sticky detail-header-group">
        <a className="label-name" onClick={() => scrollToTop()}>
          {label.name}
        </a>
        {label?.studio?.name ? (
          <>
            <span className="detail-divider">/</span>
            <span className="label-studio">{label?.studio?.name}</span>
          </>
        ) : (
          ""
        )}
      </div>
    </div>
  );
};
