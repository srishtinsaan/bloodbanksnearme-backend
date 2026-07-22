// utils/geocode.js
import { PincodeCache } from "../models/pinCodeCache.model.js";
import { BankProfile } from "../models/bankProfile.model.js";

const NOMINATIM_HEADERS = {
  "User-Agent": "BloodConnect/1.0 (contact: srish17816@gmail.com)",
};

const tryStructuredSearch = async (pincode) => {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&country=India&format=json`;
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
};

const tryFreeTextSearch = async (pincode) => {
  const url = `https://nominatim.openstreetmap.org/search?q=${pincode}, India&format=json`;
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
};

// Last resort: find a BankProfile doc in the same postal region (same first
// 3 digits = same city/district in the Indian PIN system) and use its
// coordinates as an approximate center. Better than failing the search
// entirely — the resulting "nearest banks" will still be genuinely close.
//
// CHANGED: reads from BankProfile now, not BloodBanks. BankProfile stores
// geo data as a GeoJSON `location` field (coordinates: [longitude, latitude]),
// not flat latitude/longitude fields, so the extraction shape changed too.
const tryRegionalFallback = async (pincode) => {
  const regionPrefix = pincode.toString().slice(0, 3);

  const regionalBank = await BankProfile.findOne({
    pincode: { $regex: `^${regionPrefix}` },
    location: { $exists: true },
  }).lean();

  if (!regionalBank) return null;

  const [longitude, latitude] = regionalBank.location.coordinates;
  return { latitude, longitude };
};

// CHANGED: reads from BankProfile now, not BloodBanks — same reasoning as
// tryRegionalFallback above.
const tryOwnDatabase = async (pincode) => {
  const bank = await BankProfile.findOne({
    pincode: pincode.toString(),
    location: { $exists: true },
  }).lean();

  if (!bank) return null;

  const [longitude, latitude] = bank.location.coordinates;
  return { latitude, longitude };
};

export const getCoordinatesFromPincode = async (pincode) => {
  const cached = await PincodeCache.findOne({ pincode });
  if (cached) {
    console.log(`Coordinates source: CACHE (pincode: ${pincode})`);
    return { latitude: cached.latitude, longitude: cached.longitude };
  }

  const ownDbResult = await tryOwnDatabase(pincode);
  if (ownDbResult) {
    console.log(`Coordinates source: OWN_DATABASE (pincode: ${pincode})`);
    // yahan bhi cache mein likh do taaki agli baar seedha CACHE se mile
    await PincodeCache.findOneAndUpdate({ pincode }, { pincode, ...ownDbResult }, { upsert: true });
    return ownDbResult;
  }

  const structuredResult = await tryStructuredSearch(pincode);
  if (structuredResult) {
    console.log(`Coordinates source: NOMINATIM_STRUCTURED (pincode: ${pincode})`);
    await PincodeCache.findOneAndUpdate({ pincode }, { pincode, ...structuredResult }, { upsert: true });
    return structuredResult;
  }

  const freeTextResult = await tryFreeTextSearch(pincode);
  if (freeTextResult) {
    console.log(`Coordinates source: NOMINATIM_FREETEXT (pincode: ${pincode})`);
    await PincodeCache.findOneAndUpdate({ pincode }, { pincode, ...freeTextResult }, { upsert: true });
    return freeTextResult;
  }

  const regionalResult = await tryRegionalFallback(pincode);
  if (regionalResult) {
    console.log(`Coordinates source: REGIONAL_FALLBACK (pincode: ${pincode})`);
    await PincodeCache.findOneAndUpdate({ pincode }, { pincode, ...regionalResult }, { upsert: true });
    return regionalResult;
  }

  throw new Error(`No coordinates found for pincode ${pincode}`);
};

// NOTE: getBankCoordinates has been removed. It read/wrote latitude/longitude
// directly on a User doc, which no longer exists on the User schema — the
// caching it provided was already silently broken (Mongoose strict mode
// drops the write, so it re-geocoded on every call). Its only known caller
// was the pre-migration donationRequest.controller.js's findNearestBankForDonation,
// which has since been rewritten to use $geoNear on BankProfile.location
// directly and no longer needs a per-bank coordinate lookup at all.
//
// If a project-wide search turns up another caller, it should be rewritten
// against BankProfile (e.g. accepting a BankProfile doc and reading its
// `location.coordinates` instead of flat lat/lng fields) rather than restored
// as-is.