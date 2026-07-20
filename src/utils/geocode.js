// utils/geocode.js
import { PincodeCache } from "../models/pinCodeCache.model.js";
import { BloodBanks } from "../models/bloodbanks.model.js";

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

// Last resort: find a BloodBanks doc in the same postal region (same first
// 3 digits = same city/district in the Indian PIN system) and use its
// coordinates as an approximate center. Better than failing the search
// entirely — the resulting "nearest banks" will still be genuinely close.
const tryRegionalFallback = async (pincode) => {
  const regionPrefix = pincode.toString().slice(0, 3);

  const regionalBank = await BloodBanks.findOne({
    pincode: { $regex: `^${regionPrefix}` },
    latitude: { $ne: null },
    longitude: { $ne: null },
  }).lean();

  if (!regionalBank) return null;

  return { latitude: regionalBank.latitude, longitude: regionalBank.longitude };
};

export const getCoordinatesFromPincode = async (pincode) => {
  const cached = await PincodeCache.findOne({ pincode });
  if (cached) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }

  let coords =
    (await tryStructuredSearch(pincode)) ||
    (await tryFreeTextSearch(pincode)) ||
    (await tryRegionalFallback(pincode));

  if (!coords) {
    throw new Error(`No coordinates found for pincode ${pincode}`);
  }

  const { latitude, longitude } = coords;

  await PincodeCache.findOneAndUpdate(
    { pincode },
    { pincode, latitude, longitude },
    { upsert: true, new: true }
  );

  return { latitude, longitude };
};

// Wrapper for bank Users: checks the bank's own cached coords first,
// falls back to getCoordinatesFromPincode, then writes back onto the User doc.
export const getBankCoordinates = async (bankUser) => {
  if (bankUser.latitude != null && bankUser.longitude != null) {
    return { latitude: bankUser.latitude, longitude: bankUser.longitude };
  }

  const { latitude, longitude } = await getCoordinatesFromPincode(bankUser.pincode);

  bankUser.latitude = latitude;
  bankUser.longitude = longitude;
  await bankUser.save();

  return { latitude, longitude };
};