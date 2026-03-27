# Studio Tools – Import Studios Feature

Add a **Studio Tools** section to **Settings → Tools** with an **Import Studios** button. This reuses the existing export format (a `.zip` containing JSON files in `studios/`) together with the existing [ImportTask](file:///d:/Data/stash-0.30.1/stashapp/internal/manager/task_import.go#33-46) / `studio.Importer` infrastructure. No new import logic is required — only a new GraphQL mutation and frontend panel.

## Proposed Changes

---

### Backend — GraphQL Schema

#### [MODIFY] [metadata.graphql](file:///d:/Data/stash-0.30.1/stashapp/graphql/schema/types/metadata.graphql)
Add new input type and result type for the studio import mutation (similar to [ImportTorrentScenesInput](file:///d:/Data/stash-0.30.1/stashapp/internal/manager/torrent_import.go#20-27)):
```graphql
input ImportStudiosInput {
  "Server-side path to a zip file exported by Studio Export"
  path: String!
  duplicateBehaviour: ImportDuplicateEnum!
  missingRefBehaviour: ImportMissingRefEnum!
}

type ImportStudiosResult {
  created: Int!
  updated: Int!
  failed: Int!
}
```

#### [MODIFY] [schema.graphql](file:///d:/Data/stash-0.30.1/stashapp/graphql/schema/schema.graphql)
Add the mutation declaration:
```graphql
importStudiosFromFile(input: ImportStudiosInput!): ImportStudiosResult!
```

---

### Backend — Manager

#### [NEW] [studio_import_from_file.go](file:///d:/Data/stash-0.30.1/stashapp/internal/manager/studio_import_from_file.go)
New file implementing `ImportStudiosFromFile(ctx, input)` on the Manager. It:
1. Opens the zip at `input.Path`
2. Unzips to a temp dir, which should have a `studios/` subfolder (matching the export zip layout)
3. Calls the existing `ImportTask.ImportStudios(ctx)` logic (extracted or called inline)
4. Returns `ImportStudiosResult{Created, Updated, Failed}`

Rather than reimplementing the loop, we can instantiate a minimal [ImportTask](file:///d:/Data/stash-0.30.1/stashapp/internal/manager/task_import.go#33-46) (pointing at the unzipped temp dir) and call its [ImportStudios](file:///d:/Data/stash-0.30.1/stashapp/internal/manager/task_import.go#234-295).

---

### Backend — GraphQL Resolver

#### [MODIFY] [resolver_mutation_metadata.go](file:///d:/Data/stash-0.30.1/stashapp/internal/api/resolver_mutation_metadata.go)
Add new resolver function:
```go
func (r *mutationResolver) ImportStudiosFromFile(ctx context.Context, input manager.ImportStudiosFromFileInput) (*manager.ImportStudiosResult, error) {
    ret, err := manager.GetInstance().ImportStudiosFromFile(ctx, input)
    return &ret, err
}
```

---

### Backend — Code Generation

After editing the [.graphql](file:///d:/Data/stash-0.30.1/stashapp/graphql/schema/schema.graphql) files, run `go generate ./...` (or the project's codegen script) to regenerate [generated_exec.go](file:///d:/Data/stash-0.30.1/stashapp/internal/api/generated_exec.go).

---

### Frontend — Locale

#### [MODIFY] [en-GB.json](file:///d:/Data/stash-0.30.1/stashapp/ui/v2.5/src/locales/en-GB.json)
Add translation keys:
```json
"config.tools.studio_tools": "Studio Tools",
"config.tools.import_studios_from_file.title": "Import Studios from File",
"config.tools.import_studios_from_file.path": "Zip file path",
"config.tools.import_studios_from_file.path_placeholder": "/path/to/studios-export.zip",
"config.tools.import_studios_from_file.duplicate": "Duplicate behaviour",
"config.tools.import_studios_from_file.missing_ref": "Missing ref behaviour",
"config.tools.import_studios_from_file.toast_done": "Import complete: {created} created, {updated} updated, {failed} failed"
```

---

### Frontend — New Panel Component

#### [NEW] [ImportStudiosFromFile.tsx](file:///d:/Data/stash-0.30.1/stashapp/ui/v2.5/src/components/StudioTools/ImportStudiosFromFile/ImportStudiosFromFile.tsx)
New React component modelled on [ImportTorrentScenesFromFile.tsx](file:///d:/Data/stash-0.30.1/stashapp/ui/v2.5/src/components/SceneTools/ImportTorrentScenesFromFile/ImportTorrentScenesFromFile.tsx):
- Server-side path input field
- `duplicateBehaviour` dropdown (IGNORE / OVERWRITE / FAIL)
- `missingRefBehaviour` dropdown (IGNORE / FAIL / CREATE)
- Import button → calls `importStudiosFromFile` mutation → shows toast

---

### Frontend — Router

#### [MODIFY] App.tsx or Settings route file (wherever `/importTorrentScenesFromFile` is registered)
Register route `/importStudiosFromFile` pointing at the new `ImportStudiosFromFile` component.

---

### Frontend — SettingsToolsPanel

#### [MODIFY] [SettingsToolsPanel.tsx](file:///d:/Data/stash-0.30.1/stashapp/ui/v2.5/src/components/Settings/SettingsToolsPanel.tsx)
Add a new `SettingSection` for **Studio Tools** with the Import Studios button/link:
```tsx
<SettingSection headingID="config.tools.studio_tools">
  <SettingsToolsSection>
    <Setting
      heading={
        <Link to="/importStudiosFromFile">
          <Button>
            <FormattedMessage id="config.tools.import_studios_from_file.title" />
          </Button>
        </Link>
      }
    />
  </SettingsToolsSection>
</SettingSection>
```

---

## Verification Plan

### Manual Verification
1. Build and run the server (`go run ./cmd/stash`)
2. In the UI, go to **Settings → Tools** — verify the **Studio Tools** section appears with the **Import Studios from File** button
3. Click the button — verify it navigates to the new panel page
4. Run a Studio export first (**Settings → Tasks → Export → Studios**) to get a zip file
5. Enter the exported zip file path in the Import panel, choose duplicate behaviour, and click **Import**
6. Verify a toast shows "Import complete: N created, ..." and that studios appear in the database
