"use node";

import { v } from "convex/values";
import { fromUrl } from 'geotiff';
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { Response, notFound, internalError, ok } from "./main";
import { toPoint as mgrsToPoint } from 'mgrs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const checkHLS = action({
  args: {
    trackerId: v.string(),
  },
  handler: async (ctx, args): Promise<Response> => {
    const tracker = await ctx.runQuery(internal.main.getSingleTracker, {
      trackerId: args.trackerId,
    });
    if (tracker.code !== 200) {
      console.warn(
        `Tracker ${args.trackerId} was not found with code ${tracker.code}.`
      );
      return tracker;
    }
    if (!tracker.tracker) {
      console.warn(
        "Tracker was not defined, but code was 200. This should not happen."
      );
      return notFound;
    }

    console.log("Searching for HLS data from CMR...");

    // Step 1: Use the CMR search API to get the relevant data URL
    async function searchExecutor(tries = 0) {
      if (!tracker.tracker)
        throw new Error(
          "Tracker was not defined, but code was 200. This should not happen."
        );
      if (tries > 5)
        throw new Error("Failed to search for HLS data. Tried 5 times.");
      if (tries > 0)
        console.warn(`Attempt ${tries + 1}/5 to search for HLS data.`);

      const url = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search";
      const mgrs = tracker.tracker.mgrs;
      const mgrsPoint = mgrsToPoint(mgrs);

      const year = new Date().getFullYear();
      const paddedMonth = (new Date().getMonth() + 1)
        .toString()
        .padStart(2, "0");
      const paddedDay = (new Date().getDate() - tries)
        .toString()
        .padStart(2, "0");

      function wgsPointToBBox(
        point: [number, number]
      ): [number, number, number, number] {
        // Since we're only supporting 100km squares, we can just do a simple
        // calculation here.

        // latitude_change = x km / 111.132 km/degree
        // longitude_change = x km / (111.132 km/degree * cos(latitude))
        // We need to go west 50km, east 50km, north 50km, and south 50km.

        const latitude_change = 50 / 111.132;
        const longitude_change = 50 / (111.132 * Math.cos(point[0]));
        return [
          point[1] - longitude_change,
          point[0] - latitude_change,
          point[1] + longitude_change,
          point[0] + latitude_change,
        ];
      }

      const bbox = wgsPointToBBox(mgrsPoint);

      const searchParams = {
        limit: 1,
        collections: ["HLSL30.v2.0"],
        datetime: `${year}-${paddedMonth}-${paddedDay}T00:00:00Z`,
        intersects: {
          type: "MultiPoint",
          coordinates: [
            [bbox[3], bbox[0]],
            [bbox[1], bbox[2]],
          ],
        },
      };

      const searchResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchParams),
      });
      if (!searchResponse.ok) {
        console.error(
          `Failed to search for HLS data. Got status ${searchResponse.status}.`
        );
        return searchExecutor(tries + 1);
      }

      const searchJson = await searchResponse.json();
      const features = searchJson.features;
      if (features.length === 0) {
        if (tries === 2) console.log(searchJson);
        console.warn("No HLS data found. Trying the previous day.");
        return searchExecutor(tries + 1);
      }

      const firstFeature = features[0];
      const itemUrl = firstFeature.links.find(
        (link: any) => link.rel === "self"
      ).href;
      console.log(searchParams);
      return itemUrl;
    }
    const hslDataUrl = await searchExecutor();
    if (!hslDataUrl) {
      return internalError;
    }
    const hslData = await (await fetch(hslDataUrl)).json(); // This is where all the actual data we care about is

    const cloudCover = hslData.properties["eo:cloud_cover"];
    const cloudCoverPercentage = cloudCover * 100;
    const cloudCoverPercentageRounded =
      Math.round(cloudCoverPercentage * 100) / 100;

    const assets = hslData.assets; // This is an object with a bunch of different image formats
    const sampleImage = hslData.assets.browse.href; // Regular satellite image
    const sampleImageResponse = await fetch(sampleImage, {
      redirect: "follow",
    }); // Grab the URL through a 303 redirect

    console.log("Downloading band B07 (Red Edge 3)");
    const token = process.env.NASA_EARTHDATA_API_KEY!;
    const nir3 = await fetch(assets['B07'].href, {
      redirect: "follow",
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const nir3Buffer = await nir3.blob();
    const storageId = await ctx.storage.store(nir3Buffer);
    const nir3Url = await ctx.storage.getUrl(storageId);
    if (!nir3Url) {
      console.error("Failed to store NIR-3 band image.");
      return internalError;
    }
    const tif = await fromUrl(nir3Url);
    if (!tif) {
      console.error("Failed to parse NIR-3 band image.");
      return internalError;
    }

    console.log("Making analysis...");

    const image = await tif.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const tileWidth = 366;
    const tileHeight = 366;
    const tiles = [];
    console.log(width, height);

    try {
      for (let x = 0; x < width; x += tileWidth) {
        for (let y = 0; y < height; y += tileHeight) {
          const tile = await image.readRasters({
            window: [x, y, x + tileWidth, y + tileHeight],
          });
          tiles.push(tile);
        }
      }
    } catch (e) {
      console.error('Something went wrong while reading the image.');
      console.error(e);
      return internalError;
    }

    // Get the average color for each tile
    const tileAverageColors = [];
    for (const tile of tiles) {
      let sum = 0;
      let lng = 1;
      if (typeof tile[0] === "number") {
        sum += tile[0];
      } else {
        lng = tile[0].length;
        for (const pixel of tile[0]) {
          sum += pixel;
        }
      }
      const average = sum / lng;
      tileAverageColors.push(average);
    }

    // Get the average color for the whole image
    let sum = 0;
    for (const tile of tileAverageColors) {
      sum += tile;
    }

    const imgAverage = sum / tileAverageColors.length;

    // Get the bounding box
    const bbox = hslData.bbox;

    console.log("Producing GPT analysis...");

    // Get the GPT-4 response
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
              You are a satellite. You are looking at Red-Edge of a part of the Earth\'s surface at MGRS ${tracker.tracker.mgrs}. 
              Your task is to take the average darkness of the image and the average darkness of the tiles and come up with reasonable explanations
              for what you are seeing.`,
        },
        {
          role: "user",
          content: `This image has a cloud cover level of ${cloudCoverPercentageRounded}%. The average darkness of the image is ${imgAverage}. The average darkness of the ${
            tileAverageColors.length
          } tiles in this image is ${tileAverageColors.join(", ")}.`,
        },
      ],
      temperature: 1,
      max_tokens: 1500,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });
    const gpt4Response = response.choices[0].message;

    console.log("Firing webhooks...");
    // Send the webhook
    const webhookTargets = tracker.tracker.webhookTargets;
    for (const target of webhookTargets) {
      await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "signing-secret": tracker.tracker.signingSecret,
        },
        body: JSON.stringify({
          trackerId: args.trackerId,
          eventType: "hls",
          gpt4Response,
          cloudCover: cloudCoverPercentage,
          satImage: sampleImageResponse.url,
          imgAvgColor: imgAverage,
          tileAvgColor: tileAverageColors,
          bbox,
        }),
      });
    }

    console.log("Logging event...");
    // Log the event
    await ctx.runMutation(internal.main.logTrackerEvent, {
      trackerId: args.trackerId,
      eventType: "hls",
      gpt4Response,
      cloudCover: cloudCoverPercentage,
      satImage: sampleImageResponse.url,
      imgAvgColor: imgAverage,
      tileAvgColor: tileAverageColors,
      bbox,
    });

    console.log("Done!");

    return ok;
  },
});
