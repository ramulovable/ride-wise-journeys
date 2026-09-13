import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, LoaderCircle, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchIndiaPlaces, selectIndiaPlace } from "@/lib/api.functions";
import type { Location } from "@/lib/data";
import { cn } from "@/lib/utils";

type LocationPickerProps = {
  locations: Location[];
  value: string;
  onChange: (location: Location) => void;
  placeholder: string;
  disabled?: boolean;
};

type LiveSuggestion = { placeId: string; label: string };

export function LocationPicker({
  locations,
  value,
  onChange,
  placeholder,
  disabled = false,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [liveResults, setLiveResults] = useState<LiveSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectingPlaceId, setSelectingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const requestNumber = useRef(0);
  const selected = locations.find((location) => location.id === value);
  const normalizedQuery = query.trim().toLocaleLowerCase("en-IN");
  const presetMatches = useMemo(
    () =>
      locations
        .filter(
          (location) =>
            location.source === "preset" &&
            (!normalizedQuery ||
              location.label.toLocaleLowerCase("en-IN").includes(normalizedQuery)),
        )
        .slice(0, normalizedQuery ? 8 : 12),
    [locations, normalizedQuery],
  );

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      setLiveResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }
    const currentRequest = ++requestNumber.current;
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const results = await searchIndiaPlaces({
          data: { query: query.trim(), sessionToken },
        });
        if (requestNumber.current === currentRequest) setLiveResults(results);
      } catch (caught) {
        if (requestNumber.current === currentRequest) {
          setLiveResults([]);
          setError(caught instanceof Error ? caught.message : "Could not search places.");
        }
      } finally {
        if (requestNumber.current === currentRequest) setIsSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery, open, query, sessionToken]);

  function choosePreset(location: Location) {
    onChange(location);
    setOpen(false);
    setQuery("");
  }

  async function chooseLivePlace(suggestion: LiveSuggestion) {
    setSelectingPlaceId(suggestion.placeId);
    setError(null);
    try {
      const location = await selectIndiaPlace({
        data: { placeId: suggestion.placeId, sessionToken },
      });
      onChange({
        id: location.id,
        name: location.name,
        area: location.area,
        formattedAddress: location.formatted_address,
        latitude: location.latitude,
        longitude: location.longitude,
        source: "google",
        pinCode: null,
        isActive: location.is_active,
        label: location.formatted_address || location.area || location.name,
      });
      setSessionToken(crypto.randomUUID());
      setQuery("");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not select this place.");
    } finally {
      setSelectingPlaceId(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 text-left font-normal"
        >
          <span className={cn("line-clamp-2", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search any place in India"
            className="h-11 border-0 px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {presetMatches.length > 0 ? (
            <div>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Darbhanga quick picks
              </p>
              {presetMatches.map((location) => (
                <Button
                  key={location.id}
                  type="button"
                  variant="ghost"
                  onClick={() => choosePreset(location)}
                  className="h-auto w-full items-start justify-start gap-2 rounded-sm px-2 py-2 text-left text-sm font-normal"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="flex-1">{location.label}</span>
                  {value === location.id ? <Check className="mt-0.5 size-4" /> : null}
                </Button>
              ))}
            </div>
          ) : null}
          {normalizedQuery.length >= 2 ? (
            <div className={cn(presetMatches.length > 0 && "mt-1 border-t pt-1")}>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Places across India
              </p>
              {isSearching ? (
                <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Searching…
                </p>
              ) : null}
              {liveResults.map((suggestion) => (
                <Button
                  key={suggestion.placeId}
                  type="button"
                  variant="ghost"
                  disabled={selectingPlaceId !== null}
                  onClick={() => void chooseLivePlace(suggestion)}
                  className="h-auto w-full items-start justify-start gap-2 whitespace-normal rounded-sm px-2 py-2 text-left text-sm font-normal"
                >
                  {selectingPlaceId === suggestion.placeId ? (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
                  ) : (
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
                  )}
                  <span>{suggestion.label}</span>
                </Button>
              ))}
              {!isSearching && !error && liveResults.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No live places found.</p>
              ) : null}
            </div>
          ) : null}
          {!normalizedQuery && presetMatches.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search India.
            </p>
          ) : null}
          {error ? <p className="px-2 py-3 text-sm text-destructive">{error}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
