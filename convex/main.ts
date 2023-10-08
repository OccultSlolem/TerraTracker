import { Doc } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import OpenAI from 'openai';


export interface Response {
  code: number;
  message: string;
}
export const ok: Response = { code: 200, message: 'OK' };
export const notFound: Response = { code: 404, message: 'Not Found' };
export const unauthorized: Response = { code: 401, message: 'Unauthorized' };
export const forbidden: Response = { code: 403, message: 'Forbidden' };
export const badRequest: Response = { code: 400, message: 'Bad Request' };
export const internalError: Response = { code: 500, message: 'Internal Error' };

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    // eslint-disable-next-line
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line
    const v = c == "x" ? r : (r & 0x3) | 0x8;
    // eslint-disable-next-line
    return v.toString(16);
  });
}

interface CreateTrackerResponse extends Response {
  trackerId?: string;
  signingSecret?: string;
}
export const createTracker = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    mgrs: v.string(),
    detailInterest: v.string(),
    propertyOwnership: v.string(),
    emails: v.array(v.string()),
    webhookTargets: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<CreateTrackerResponse> => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) {
      return unauthorized;
    }

    const sameName = await ctx.db.query('trackers')
      .filter((q) => q.eq(q.field('accountId'), id.tokenIdentifier))
      .filter((q) => q.eq(q.field('name'), args.name))
      .collect();
    
    if (sameName.length > 0) {
      return {
        code: 409,
        message: 'Tracker with same name already exists',
      }
    }

    const emails = args.emails.map((email) => ({
      email,
      verified: false,
    }));

    const trackerId = generateUUID();
    const signingSecret = generateUUID();

    await ctx.db.insert('trackers', {
      id: trackerId,
      accountId: id.tokenIdentifier,
      name: args.name,
      description: args.description,
      mgrs: args.mgrs,
      detailInterest: args.detailInterest,
      propertyOwnership: args.propertyOwnership,
      emails,
      webhookTargets: args.webhookTargets,
      signingSecret,
    });

    return {
      code: 200,
      trackerId,
      signingSecret,
    } as CreateTrackerResponse;
  }
});

export interface Tracker {
  id: string;
  name: string;
  description: string;
  mgrs: string;
  detailInterest: string;
  propertyOwnership: string;
  emails: {
    email: string;
    verified: boolean;
  }[];
  webhookTargets: string[];
}

/**
 * Sanitizes a tracker object to be returned to the client
 * @param tracker 
 */
function trackerDocToInterface(tracker: Doc<'trackers'>): Tracker {
  return {
    id: tracker.id,
    name: tracker.name,
    description: tracker.description,
    mgrs: tracker.mgrs,
    detailInterest: tracker.detailInterest,
    propertyOwnership: tracker.propertyOwnership,
    emails: tracker.emails,
    webhookTargets: tracker.webhookTargets,
  };
}

interface GetTrackersMultiResponse extends Response {
  trackers?: Tracker[];
}
//TODO: add tracker events
export const getUserTrackers = query({
  args: {},
  handler: async (ctx, args): Promise<GetTrackersMultiResponse> => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) {
      return unauthorized;
    }

    try {
      const trackers = (await ctx.db.query('trackers')
        .filter((q) => q.eq(q.field('accountId'), id.tokenIdentifier))
        .collect()).map((t) => trackerDocToInterface(t));

      return {
        code: 200,
        trackers,
      } as GetTrackersMultiResponse;
    } catch (e) {
      console.error(e);
      return {
        code: 500,
        message: 'Internal Error',
      };
    } 
  }
});

interface GetTrackerSingleResponse extends Response {
  tracker?: Doc<'trackers'>;
}
export const getSingleTracker = internalQuery({
  args: {
    trackerId: v.string(),
  },
  handler: async (ctx, args): Promise<GetTrackerSingleResponse> => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) {
      return unauthorized;
    }

    try {
      const tracker = await ctx.db.query('trackers')
        .filter((q) => q.eq(q.field('id'), args.trackerId))
        .first();
      if (!tracker) {
        return notFound;
      }

      if (tracker.accountId !== id.tokenIdentifier) {
        return forbidden;
      }

      return {
        code: 200,
        message: 'OK',
        tracker: tracker,
      } as GetTrackerSingleResponse;
    } catch (e) {
      console.error(e);
      return {
        code: 500,
        message: 'Internal Error',
      };
    } 
  }
});

export const talkToGPT4 = internalAction({
  args: {
    systemMessage: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    
  }
})

export const logTrackerEvent = internalMutation({
  args: {
    trackerId: v.string(),
    eventType: v.string(),
    gpt4Response: v.any(),
    cloudCover: v.number(),
    satImage: v.string(),
    imgAvgColor: v.number(),
    tileAvgColor: v.array(v.number()),
    bbox: v.array(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) {
      return unauthorized;
    }

    const event = {
      id: generateUUID(),
      trackerId: args.trackerId,
      eventType: args.eventType,
      gpt4Response: args.gpt4Response,
      cloudCover: args.cloudCover,
      satImage: args.satImage,
      imgAvgColor: args.imgAvgColor,
      tileAvgColor: args.tileAvgColor,
      bbox: args.bbox,
    };

    await ctx.db.insert('trackerEvents', event); 
  }
});

