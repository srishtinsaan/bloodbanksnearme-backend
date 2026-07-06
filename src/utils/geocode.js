// utils/geocode.js
import { PincodeCache } from "../models/pincodeCache.model.js";

// Low-level: pincode -> {latitude, longitude}
// Checks PincodeCache first, only calls Nominatim on a miss.
export const getCoordinatesFromPincode = async (pincode) => {
  const cached = await PincodeCache.findOne({ pincode });
  if (cached) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }

  const url = `https://nominatim.openstreetmap.org/search?postalcode=${pincode}&country=India&format=json`;

  const response = await fetch(url, {
    headers: {
      // Nominatim requires a descriptive User-Agent identifying the app
      "User-Agent": "BloodConnect/1.0 (contact: srish17816@gmail.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error(`No coordinates found for pincode ${pincode}`);
  }

  const latitude = parseFloat(data[0].lat);
  const longitude = parseFloat(data[0].lon);

  // Write-through cache so the next lookup for this pincode is free.
// Uses an atomic upsert instead of create() — if two requests for the
// same previously-unseen pincode race each other, both may miss the
// cache above and reach this point simultaneously. create() would
// throw a duplicate-key error for the second write since `pincode`
// has a unique index. findOneAndUpdate with upsert:true is atomic at
// the DB level, so the second call just matches the first call's
// document instead of erroring.
await PincodeCache.findOneAndUpdate(
  { pincode },
  { pincode, latitude, longitude },
  { upsert: true, new: true }
);

return { latitude, longitude };

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