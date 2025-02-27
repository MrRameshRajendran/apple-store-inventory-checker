const request = require("request");
const notifier = require("node-notifier");
const flatMap = require('array.prototype.flatmap');
const replaceAll = require("string.prototype.replaceall");

flatMap.shim();
replaceAll.shim();

const { COUNTRIES } = require("./constants");
const args = process.argv.slice(2);

let skusForCountry = (countrySkuCode) => {
  return {
    [`MMQX3${countrySkuCode}/A`]: 'MMQX3 14" M1 Max 10 Core CPU 32 Core GPU 2TB Silver, Ultimate',
    [`MKH53${countrySkuCode}/A`]: 'MKH53 14" M1 Max 10 Core CPU 32 Core GPU 2TB Space Grey, Ultimate',
    [`MMQW3${countrySkuCode}/A`]: 'MMQW3 16" M1 Max 10 Core CPU 32 Core GPU 4TB Silver, Ultimate',
    [`MK233${countrySkuCode}/A`]: 'MK233 16" M1 Max 10 Core CPU 32 Core GPU 4TB Space Grey, Ultimate',
    [`MK1A3${countrySkuCode}/A`]: 'MK1A3 high',
    [`MK1H3${countrySkuCode}/A`]: 'MK1H3 high',
    [`MKGR3${countrySkuCode}/A`]: 'MKGR3 high',
    [`MKGP3${countrySkuCode}/A`]: 'MKGP3 high',
  }
}

let favouritesForCountry = (countrySkuCode) => {
  return [
    `MMQX3${countrySkuCode}/A`,
    `MKH53${countrySkuCode}/A`,
    `MK1A3${countrySkuCode}/A`,
    `MK1H3${countrySkuCode}/A`,
  ]
}

const control = "MYD92LL/A";
let storeNumber = "R172";
let state = "CO";
let country = "US"

if (args.length > 0) {
  const passedStore = args[0];
  country = (args[1] ? args[1] : "US").toUpperCase();
  if (passedStore.charAt(0) === "R") {
    // All retail store numbers start with R
    storeNumber = passedStore;
    state = null;
  }
}

const countryConfig = COUNTRIES[country];

let storePath = countryConfig["storePath"];
let skuList = skusForCountry(countryConfig["skuCode"]);
let favorites = favouritesForCountry(countryConfig["skuCode"]);

const query =
  Object.keys(skuList)
    .map((k, i) => `parts.${i}=${encodeURIComponent(k)}`)
    .join("&") + `&searchNearby=true&store=${storeNumber}`;

let options = {
  method: "GET",
  url: `https://www.apple.com${storePath}/shop/fulfillment-messages?` + query,
};

request(options, function (error, response) {
  if (error) throw new Error(error);

  const body = JSON.parse(response.body);
  const storesArray = body.body.content.pickupMessage.stores;
  let skuCounter = {};
  let hasStoreSearchError = false;

  console.log('Inventory');
  console.log('---------');
  const statusArray = storesArray
    .flatMap((store) => {
      if (state && state !== store.state) return null;

      const name = store.storeName;
      let productStatus = [];

      for (const [key, value] of Object.entries(skuList)) {
        const product = store.partsAvailability[key];

        hasStoreSearchError = product.storeSearchEnabled !== true;

        if (key === control && hasStoreSearchError !== true) {
          hasStoreSearchError = product.pickupDisplay !== "available";
        } else {
          productStatus.push(`${value}: ${product.pickupDisplay}`);

          if (product.pickupDisplay === "available") {
            console.log(`${value} in stock at ${store.storeName}`);
            let count = skuCounter[key] ? skuCounter[key] : 0;
            count += 1;
            skuCounter[key] = count;
          }
        }
      }

      return {
        name: name,
        products: productStatus,
      };
    })
    .filter((n) => n);

  let hasError = hasStoreSearchError;

  const inventory = Object.entries(skuCounter)
    .map(([key, value]) => `${skuList[key]}: ${value}`)
    .join(" | ");

  console.log('\nInventory counts');
  console.log('----------------');
  console.log(inventory.replaceAll(" | ", "\n"));
  let hasUltimate = Object.keys(skuCounter).some(
    (r) => favorites.indexOf(r) >= 0
  );
  let notificationMessage;

  if (inventory) {
    notificationMessage = `${hasUltimate ? "FOUND ULTIMATE! " : ""
      }Some models found: ${inventory}`;
  } else {
    notificationMessage = "No models found.";
    console.log(statusArray);
    console.log(notificationMessage);
  }

  const message = hasError ? "Possible error?" : notificationMessage;
  notifier.notify({
    title: "MacBook Pro Availability",
    message: message,
    sound: hasError || inventory,
    timeout: false,
  });

  // Log time at end
  console.log(`\nGenerated: ${new Date().toLocaleString()}`);
});
