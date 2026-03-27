import React, { useMemo, useState } from "react";
import { Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import { gql, useMutation } from "@apollo/client";
import * as GQL from "src/core/generated-graphql";
import { useToast } from "src/hooks/Toast";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { ErrorMessage } from "src/components/Shared/ErrorMessage";

const IMPORT_TORRENT_SCENES_FROM_FILE = gql`
  mutation ImportTorrentScenesFromFile($input: ImportTorrentScenesInput!) {
    importTorrentScenesFromFile(input: $input) {
      created
      failed
      failFilePath
    }
  }
`;

type FieldOptionRow = {
  field: string;
  labelId: string;
  createMissing?: boolean;
  strategy: GQL.IdentifyFieldStrategy;
};

const allowedFields: Array<{ field: string; labelId: string; allowCreateMissing?: boolean }> =
  [
    { field: "title", labelId: "title" },
    { field: "code", labelId: "scene_code" },
    { field: "cover_image", labelId: "cover_image" },
    { field: "date", labelId: "date" },
    { field: "director", labelId: "director" },
    { field: "url", labelId: "url" },
    { field: "studio", labelId: "studio_and_parent", allowCreateMissing: true },
    { field: "performers", labelId: "performers", allowCreateMissing: true },
    { field: "groups", labelId: "groups" },
    { field: "details", labelId: "details" },
    { field: "stash_ids", labelId: "stash_ids" },
  ];

export const ImportTorrentScenesFromFile: React.FC = () => {
  const intl = useIntl();
  const Toast = useToast();

  const [path, setPath] = useState("");
  const [normalizeTitle, setNormalizeTitle] = useState(false);
  const [useScrapers, setUseScrapers] = useState(false);
  const [scraperID, setScraperID] = useState<string>("");

  const { data, loading, error } = GQL.useListSceneScrapersQuery();

  const scrapers = useMemo(() => {
    return (data?.listScrapers ?? []).filter((s) => !!s.scene);
  }, [data?.listScrapers]);

  const [fieldOptions, setFieldOptions] = useState<FieldOptionRow[]>(
    allowedFields.map((f) => ({
      field: f.field,
      labelId: f.labelId,
      createMissing: f.allowCreateMissing ? false : undefined,
      strategy: GQL.IdentifyFieldStrategy.Merge,
    }))
  );

  const [runImport, { loading: importing }] = useMutation(
    IMPORT_TORRENT_SCENES_FROM_FILE
  );

  const canRun = path.trim().length > 0 && (!useScrapers || scraperID);

  async function onImport() {
    try {
      const input: GQL.ImportTorrentScenesInput = {
        path,
        normalizeTitle,
        useScrapers,
      };

      if (useScrapers) {
        input.scraperID = scraperID;
        input.fieldOptions = fieldOptions.map((f) => ({
          field: f.field,
          strategy: f.strategy,
          createMissing:
            f.createMissing === undefined ? undefined : Boolean(f.createMissing),
        }));
      }

      const res = await runImport({ variables: { input } });
      const r = res.data?.importTorrentScenesFromFile;
      if (!r) return;

      Toast.success(
        intl.formatMessage(
          { id: "config.tools.import_torrent_scenes_from_file.toast_done" },
          { created: r.created, failed: r.failed }
        )
      );

      if (r.failed > 0) {
        Toast.toast({
          variant: "warning",
          content: intl.formatMessage(
            { id: "config.tools.import_torrent_scenes_from_file.toast_fail_path" },
            { path: r.failFilePath }
          ),
        });
      }
    } catch (e) {
      Toast.error(e);
    }
  }

  return (
    <div className="container-fluid">
      <h3 className="mb-3">
        <FormattedMessage id="config.tools.import_torrent_scenes_from_file.title" />
      </h3>

      <Card className="mb-3">
        <Card.Body>
          <Form>
            <Form.Group as={Row} controlId="import-path">
              <Form.Label column sm={3}>
                <FormattedMessage id="config.tools.import_torrent_scenes_from_file.path" />
              </Form.Label>
              <Col sm={9}>
                <Form.Control
                  value={path}
                  onChange={(e) => setPath(e.currentTarget.value)}
                  placeholder={intl.formatMessage({
                    id: "config.tools.import_torrent_scenes_from_file.path_placeholder",
                  })}
                />
              </Col>
            </Form.Group>

            <Form.Group as={Row} controlId="normalize-title">
              <Form.Label column sm={3}>
                <FormattedMessage id="config.tools.import_torrent_scenes_from_file.normalize" />
              </Form.Label>
              <Col sm={9}>
                <Form.Check
                  type="switch"
                  checked={normalizeTitle}
                  onChange={(e) => setNormalizeTitle(e.currentTarget.checked)}
                />
              </Col>
            </Form.Group>

            <Form.Group as={Row} controlId="use-scrapers">
              <Form.Label column sm={3}>
                <FormattedMessage id="config.tools.import_torrent_scenes_from_file.use_scrapers" />
              </Form.Label>
              <Col sm={9}>
                <Form.Check
                  type="switch"
                  checked={useScrapers}
                  onChange={(e) => setUseScrapers(e.currentTarget.checked)}
                />
              </Col>
            </Form.Group>

            {useScrapers && (
              <>
                {loading && <LoadingIndicator />}
                {error && <ErrorMessage error={error} />}

                <Form.Group as={Row} controlId="scraper-id">
                  <Form.Label column sm={3}>
                    <FormattedMessage id="config.tools.import_torrent_scenes_from_file.scraper" />
                  </Form.Label>
                  <Col sm={9}>
                    <Form.Control
                      as="select"
                      value={scraperID}
                      onChange={(e) => setScraperID(e.currentTarget.value)}
                    >
                      <option value="">
                        {intl.formatMessage({ id: "actions.select" })}
                      </option>
                      {scrapers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Form.Control>
                  </Col>
                </Form.Group>

                <h5 className="mt-4">
                  <FormattedMessage id="config.tools.import_torrent_scenes_from_file.field_options" />
                </h5>

                <Table bordered size="sm">
                  <thead>
                    <tr>
                      <th>
                        <FormattedMessage id="config.tasks.identify.field" />
                      </th>
                      <th>
                        <FormattedMessage id="config.tasks.identify.strategy" />
                      </th>
                      <th>
                        <FormattedMessage id="config.tasks.identify.create_missing" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldOptions.map((row, idx) => {
                      const allowCreateMissing = allowedFields.find(
                        (f) => f.field === row.field
                      )?.allowCreateMissing;
                      return (
                        <tr key={row.field}>
                          <td>{intl.formatMessage({ id: row.labelId })}</td>
                          <td>
                            <Form.Control
                              as="select"
                              value={row.strategy}
                              onChange={(e) => {
                                const v = e.currentTarget
                                  .value as GQL.IdentifyFieldStrategy;
                                const next = [...fieldOptions];
                                next[idx] = { ...row, strategy: v };
                                setFieldOptions(next);
                              }}
                            >
                              <option value="IGNORE">
                                {intl.formatMessage({ id: "actions.ignore" })}
                              </option>
                              <option value="MERGE">
                                {intl.formatMessage({ id: "actions.merge" })}
                              </option>
                              <option value="OVERWRITE">
                                {intl.formatMessage({ id: "actions.overwrite" })}
                              </option>
                            </Form.Control>
                          </td>
                          <td>
                            {allowCreateMissing ? (
                              <Form.Check
                                type="checkbox"
                                checked={Boolean(row.createMissing)}
                                onChange={(e) => {
                                  const next = [...fieldOptions];
                                  next[idx] = {
                                    ...row,
                                    createMissing: e.currentTarget.checked,
                                  };
                                  setFieldOptions(next);
                                }}
                              />
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </>
            )}

            <Button disabled={!canRun || importing} onClick={onImport}>
              <FormattedMessage id="actions.import" />
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default ImportTorrentScenesFromFile;

