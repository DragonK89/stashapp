import React, { useState, useEffect, useRef } from "react";
import { initialConfig, ITaggerConfig } from "src/components/Tagger/constants";
import * as GQL from "src/core/generated-graphql";
import {
  queryFindPerformer,
  queryFindStudio,
  queryScrapeGallery,
  queryScrapeGalleryQuery,
  queryScrapeGalleryURL,
  useListGalleryScrapers,
  usePerformerCreate,
  usePerformerUpdate,
  useGalleryUpdate,
  useAddGalleryImagesByUrlMutation,
  useStudioCreate,
  useStudioUpdate,
  useTagCreate,
  useTagUpdate,
} from "src/core/StashService";
import { useToast } from "src/hooks/Toast";
import { useConfigurationContext } from "src/hooks/Config";
import { ITaggerSource, SCRAPER_PREFIX, STASH_BOX_PREFIX } from "./constants";
import { errorToString } from "src/utils";
import { mergeStudioStashIDs } from "./utils";
import { useTaggerConfig } from "./config";
import { useIsMounted } from "src/hooks/state";

export interface ITaggerContextState {
  config: ITaggerConfig;
  setConfig: (c: ITaggerConfig) => void;
  loading: boolean;
  loadingMulti?: boolean;
  multiError?: string;
  sources: ITaggerSource[];
  currentSource?: ITaggerSource;
  searchResults: Record<string, IGalleryQueryResult>;
  setCurrentSource: (src?: ITaggerSource) => void;
  doGalleryQuery: (galleryID: string, searchStr: string) => Promise<void>;
  doMultiGalleryQueryScrape: (
    queries: { galleryID: string; searchVal: string }[]
  ) => Promise<void>;
  stopMultiScrape: () => void;
  createNewTag: (
    tag: GQL.ScrapedTag,
    toCreate: GQL.TagCreateInput
  ) => Promise<string | undefined>;
  createNewPerformer: (
    performer: GQL.ScrapedPerformer,
    toCreate: GQL.PerformerCreateInput
  ) => Promise<string | undefined>;
  linkPerformer: (
    performer: GQL.ScrapedPerformer,
    performerID: string
  ) => Promise<void>;
  createNewStudio: (
    studio: GQL.ScrapedStudio,
    toCreate: GQL.StudioCreateInput
  ) => Promise<string | undefined>;
  updateStudio: (studio: GQL.StudioUpdateInput) => Promise<void>;
  linkStudio: (studio: GQL.ScrapedStudio, studioID: string) => Promise<void>;
  updateTag: (
    tag: GQL.ScrapedTag,
    updateInput: GQL.TagUpdateInput
  ) => Promise<void>;
  resolveGallery: (
    galleryID: string,
    index: number,
    gallery: IScrapedGallery
  ) => Promise<void>;
  saveGallery: (
    galleryCreateInput: GQL.GalleryUpdateInput
  ) => Promise<void>;
  addGalleryImagesByUrl: (galleryID: string, urls: string[]) => Promise<void>;
}

const dummyFn = () => {
  return Promise.resolve();
};
const dummyValFn = () => {
  return Promise.resolve(undefined);
};

export const TaggerStateContext = React.createContext<ITaggerContextState>({
  config: initialConfig,
  setConfig: () => { },
  loading: false,
  sources: [],
  searchResults: {},
  setCurrentSource: () => { },
  doGalleryQuery: dummyFn,
  doMultiGalleryQueryScrape: dummyFn,
  stopMultiScrape: () => { },
  createNewTag: dummyValFn,
  createNewPerformer: dummyValFn,
  linkPerformer: dummyFn,
  createNewStudio: dummyValFn,
  updateStudio: dummyFn,
  linkStudio: dummyFn,
  updateTag: dummyFn,
  resolveGallery: dummyFn,
  saveGallery: dummyFn,
  addGalleryImagesByUrl: dummyFn,
});

export type IScrapedGallery = GQL.ScrapedGallery & {
  resolved?: boolean;
  image?: string;
};

export interface IGalleryQueryResult {
  results?: IScrapedGallery[];
  error?: string;
}

const builtinAutoTagScraperID = "builtin_autotag";

export const TaggerContext: React.FC = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [loadingMulti, setLoadingMulti] = useState(false);
  const [sources, setSources] = useState<ITaggerSource[]>([]);
  const [currentSource, setCurrentSource] = useState<ITaggerSource>();
  const [multiError, setMultiError] = useState<string | undefined>();
  const [searchResults, setSearchResults] = useState<
    Record<string, IGalleryQueryResult>
  >({});

  const stopping = useRef(false);

  const { configuration: stashConfig } = useConfigurationContext();
  const isMounted = useIsMounted();
  const { config, setConfig } = useTaggerConfig();

  const Scrapers = useListGalleryScrapers();

  const Toast = useToast();
  const [createTag] = useTagCreate();
  const [createPerformer] = usePerformerCreate();
  const [updatePerformer] = usePerformerUpdate();
  const [createStudio] = useStudioCreate();
  const [updateStudioMutation] = useStudioUpdate();
  const [updateGalleryMutation] = useGalleryUpdate();
  const [addGalleryImagesByUrlMutation] = useAddGalleryImagesByUrlMutation();
  const [updateTagMutation] = useTagUpdate();

  useEffect(() => {
    if (!stashConfig || !Scrapers.data) {
      return;
    }

    const scrapers = Scrapers.data.listScrapers.filter(
      (s) => s.id !== builtinAutoTagScraperID && s.name !== "Auto Tag"
    );

    const scraperSources: ITaggerSource[] = scrapers
      .filter((s) =>
        s.gallery?.supported_scrapes.some(
          (t) => t === GQL.ScrapeType.Url
        )
      )
      .map((s) => ({
        id: `${SCRAPER_PREFIX}${s.id}`,
        sourceInput: {
          scraper_id: s.id,
        },
        displayName: s.name,
        supportGalleryQuery: true,
        supportedURLs: s.gallery?.urls ?? [],
      }));

    setSources(scraperSources);
  }, [Scrapers.data, stashConfig]);

  useEffect(() => {
    if (!sources.length || currentSource) {
      return;
    }
    if (config.selectedEndpoint) {
      let source = sources.find(
        (s) => s.sourceInput.stash_box_endpoint == config.selectedEndpoint
      );
      if (source) {
        setCurrentSource(source);
        return;
      }
    }
    setCurrentSource(sources[0]);
  }, [sources, currentSource, config]);

  useEffect(() => {
    setSearchResults({});
  }, [currentSource]);

  useEffect(() => {
    const selectedEndpoint = currentSource?.sourceInput.stash_box_endpoint;
    if (selectedEndpoint && selectedEndpoint !== config.selectedEndpoint) {
      setConfig({
        ...config,
        selectedEndpoint,
      });
    }
  }, [currentSource, config, setConfig]);

  function clearSearchResults(galleryID: string) {
    if (!isMounted.current) {
      return;
    }

    setSearchResults((current) => {
      const newSearchResults = { ...current };
      delete newSearchResults[galleryID];
      return newSearchResults;
    });
  }

  async function galleryQuery(galleryID: string, searchVal: string) {
    if (!currentSource) {
      return;
    }

    try {
      clearSearchResults(galleryID);

      let results;
      if (searchVal.startsWith("http")) {
        results = await queryScrapeGalleryURL(searchVal);
      } else {
        results = await queryScrapeGalleryQuery(
          currentSource.sourceInput,
          searchVal
        );
      }

      let newResult: IGalleryQueryResult;
      const resolved =
        currentSource.sourceInput.stash_box_endpoint !== undefined;

      if (results.error) {
        newResult = { error: results.error.message };
      } else if (results.errors) {
        newResult = { error: results.errors.toString() };
      } else {
        const data = results.data as any;
        const scraperResults = data.scrapeGalleryURL
          ? [data.scrapeGalleryURL]
          : data.scrapeSingleGallery;

        newResult = {
          results: scraperResults.map((r: any) => ({
            ...r,
            resolved,
          })),
        };
      }

      if (isMounted.current) {
        setSearchResults((current) => ({ ...current, [galleryID]: newResult }));
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        setSearchResults((current) => ({
          ...current,
          [galleryID]: { error: errorToString(err) },
        }));
      }
    }
  }

  async function doGalleryQuery(galleryID: string, searchVal: string) {
    try {
      setLoading(true);
      await galleryQuery(galleryID, searchVal);
    } catch (err) {
      Toast.error(err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  async function doMultiGalleryQueryScrape(
    queries: { galleryID: string; searchVal: string }[]
  ) {
    if (!currentSource) {
      return;
    }

    setSearchResults({});

    try {
      stopping.current = false;
      setLoadingMulti(true);
      setMultiError(undefined);

      await queries.reduce(async (promise, q) => {
        await promise;
        if (!stopping.current) {
          await galleryQuery(q.galleryID, q.searchVal);
        }
      }, Promise.resolve());
    } catch (err) {
      Toast.error(err);
    } finally {
      if (isMounted.current) {
        setLoadingMulti(false);
      }
    }
  }

  function stopMultiScrape() {
    stopping.current = true;
  }

  async function resolveGallery(
    galleryID: string,
    index: number,
    gallery: IScrapedGallery
  ) {
    if (!currentSource || gallery.resolved || !searchResults[galleryID]?.results) {
      return Promise.resolve();
    }

    try {
      const newResult = [...searchResults[galleryID].results!];
      newResult[index] = { ...gallery, resolved: true };
      if (isMounted.current) {
        setSearchResults({
          ...searchResults,
          [galleryID]: { ...searchResults[galleryID], results: newResult },
        });
      }
    } catch (err) {
      Toast.error(err);
    }
  }

  async function saveGallery(
    galleryCreateInput: GQL.GalleryUpdateInput
  ) {
    try {
      setLoading(true);
      await updateGalleryMutation({
        variables: {
          input: galleryCreateInput,
        },
      });

      clearSearchResults(galleryCreateInput.id);
    } catch (err) {
      Toast.error(err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  async function addGalleryImagesByUrl(galleryID: string, urls: string[]) {
    try {
      setLoading(true);
      await addGalleryImagesByUrlMutation({
        variables: {
          gallery_id: galleryID,
          urls,
        },
      });
    } catch (err) {
      Toast.error(err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }

  function mapResults(fn: (r: IScrapedGallery) => IScrapedGallery) {
    const newSearchResults = { ...searchResults };

    Object.keys(newSearchResults).forEach((k) => {
      const searchResult = searchResults[k];
      if (!searchResult.results) {
        return;
      }

      newSearchResults[k].results = searchResult.results.map(fn);
    });

    return newSearchResults;
  }

  async function createNewTag(
    tag: GQL.ScrapedTag,
    toCreate: GQL.TagCreateInput
  ) {
    try {
      const result = await createTag({
        variables: {
          input: toCreate,
        },
      });

      const tagID = result.data?.tagCreate?.id;
      if (tagID === undefined) return undefined;

      const newSearchResults = mapResults((r) => {
        if (!r.tags) {
          return r;
        }

        return {
          ...r,
          tags: r.tags.map((t) => {
            if (t.name === tag.name) {
              return {
                ...t,
                stored_id: tagID,
              };
            }

            return t;
          }),
        };
      });

      if (isMounted.current) {
        setSearchResults(newSearchResults);
      }

      Toast.success(
        <span>
          Created tag: <b>{toCreate.name}</b>
        </span>
      );

      return tagID;
    } catch (e) {
      Toast.error(e);
    }
  }

  async function createNewPerformer(
    performer: GQL.ScrapedPerformer,
    toCreate: GQL.PerformerCreateInput
  ) {
    try {
      const result = await createPerformer({
        variables: {
          input: toCreate,
        },
      });

      const performerID = result.data?.performerCreate?.id;
      if (performerID === undefined) return undefined;

      const newSearchResults = mapResults((r) => {
        if (!r.performers) {
          return r;
        }

        return {
          ...r,
          performers: r.performers.map((p) => {
            const matches = performer.remote_site_id
              ? p.remote_site_id === performer.remote_site_id
              : p.name === performer.name;

            if (matches) {
              return {
                ...p,
                stored_id: performerID,
              };
            }

            return p;
          }),
        };
      });

      if (isMounted.current) {
        setSearchResults(newSearchResults);
      }

      Toast.success(
        <span>
          Created performer: <b>{toCreate.name}</b>
        </span>
      );

      return performerID;
    } catch (e) {
      Toast.error(e);
    }
  }

  async function linkPerformer(
    performer: GQL.ScrapedPerformer,
    performerID: string
  ) {
    if (
      !performer.remote_site_id ||
      !currentSource?.sourceInput.stash_box_endpoint
    ) {
      return;
    }

    try {
      const p = await queryFindPerformer(performerID);
      if (!p.data.findPerformer) return;

      const stashIDs = [
        ...(p.data.findPerformer.stash_ids ?? []).map((s) => ({
          endpoint: s.endpoint,
          stash_id: s.stash_id,
        })),
        {
          endpoint: currentSource.sourceInput.stash_box_endpoint!,
          stash_id: performer.remote_site_id,
        },
      ];

      await updatePerformer({
        variables: {
          input: {
            id: performerID,
            stash_ids: stashIDs,
          },
        },
      });

      const newSearchResults = mapResults((r) => {
        if (!r.performers) {
          return r;
        }

        return {
          ...r,
          performers: r.performers.map((foundP) => {
            if (foundP.remote_site_id === performer.remote_site_id) {
              return {
                ...foundP,
                stored_id: performerID,
              };
            }

            return foundP;
          }),
        };
      });

      if (isMounted.current) {
        setSearchResults(newSearchResults);
      }

      Toast.success(
        <span>
          Linked performer: <b>{performer.name}</b>
        </span>
      );
    } catch (e) {
      Toast.error(e);
    }
  }

  async function createNewStudio(
    studio: GQL.ScrapedStudio,
    toCreate: GQL.StudioCreateInput
  ) {
    try {
      const result = await createStudio({
        variables: {
          input: toCreate,
        },
      });

      const studioID = result.data?.studioCreate?.id;
      if (studioID === undefined) return undefined;

      const newSearchResults = mapResults((r) => {
        if (r.studio?.name === studio.name) {
          return {
            ...r,
            studio: {
              ...(r.studio as any),
              stored_id: studioID,
            },
          } as IScrapedGallery;
        }

        return r;
      });

      if (isMounted.current) {
        setSearchResults(newSearchResults);
      }

      Toast.success(
        <span>
          Created studio: <b>{toCreate.name}</b>
        </span>
      );

      return studioID;
    } catch (e) {
      Toast.error(e);
    }
  }

  async function updateStudio(updateInput: GQL.StudioUpdateInput) {
    try {
      await updateStudioMutation({
        variables: {
          input: updateInput,
        },
      });

      Toast.success(
        <span>
          Updated studio: <b>{updateInput.name}</b>
        </span>
      );
    } catch (e) {
      Toast.error(e);
    }
  }

  async function linkStudio(studio: GQL.ScrapedStudio, studioID: string) {
    if (
      !studio.remote_site_id ||
      !currentSource?.sourceInput.stash_box_endpoint
    ) {
      return;
    }

    try {
      const s = await queryFindStudio(studioID);
      if (!s.data.findStudio) return;

      const stashIDs = [
        ...(s.data.findStudio.stash_ids ?? []).map((stashID) => ({
          endpoint: stashID.endpoint,
          stash_id: stashID.stash_id,
        })),
        {
          endpoint: currentSource.sourceInput.stash_box_endpoint!,
          stash_id: studio.remote_site_id,
        },
      ];

      await updateStudioMutation({
        variables: {
          input: {
            id: studioID,
            stash_ids: stashIDs,
          },
        },
      });

      const newSearchResults = mapResults((r) => {
        if (r.studio?.remote_site_id === studio.remote_site_id) {
          return {
            ...r,
            studio: {
              ...(r.studio as any),
              stored_id: studioID,
            },
          } as IScrapedGallery;
        }

        return r;
      });

      if (isMounted.current) {
        setSearchResults(newSearchResults);
      }

      Toast.success(
        <span>
          Linked studio: <b>{studio.name}</b>
        </span>
      );
    } catch (e) {
      Toast.error(e);
    }
  }

  async function updateTag(
    _tag: GQL.ScrapedTag,
    updateInput: GQL.TagUpdateInput
  ) {
    try {
      await updateTagMutation({
        variables: {
          input: updateInput,
        },
      });

      Toast.success(
        <span>
          Updated tag: <b>{updateInput.name}</b>
        </span>
      );
    } catch (e) {
      Toast.error(e);
    }
  }

  return (
    <TaggerStateContext.Provider
      value={{
        config,
        setConfig,
        loading,
        loadingMulti,
        multiError,
        sources,
        currentSource,
        searchResults,
        setCurrentSource,
        doGalleryQuery,
        doMultiGalleryQueryScrape,
        stopMultiScrape,
        createNewTag,
        createNewPerformer,
        linkPerformer,
        createNewStudio,
        updateStudio,
        linkStudio,
        updateTag,
        resolveGallery,
        saveGallery,
        addGalleryImagesByUrl,
      }}
    >
      {children}
    </TaggerStateContext.Provider>
  );
};
