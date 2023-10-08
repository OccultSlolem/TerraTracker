import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  trackers: defineTable({
    id: v.string(),
    accountId: v.string(),
    name: v.string(),
    description: v.string(),
    mgrs: v.string(), // Military Grid Reference System
    // HLS-2 only goes to 100km
    detailInterest: v.string(),
    propertyOwnership: v.string(),
    emails: v.array(v.object({
      email: v.string(),
      verified: v.boolean(),
    })),
    webhookTargets: v.array(v.string()),
    signingSecret: v.string(),
  }),
  trackerEvents: defineTable({
    id: v.string(),
    trackerId: v.string(),
    eventType: v.string(),
    gpt4Response: v.string(),
    satImage: v.optional(v.string()), // I'm pretty sure this will always be defined, but just in case
    cloudCover: v.number(),
    imgAvgColor: v.number(),
    tileAvgColor: v.array(v.number()),
    bbox: v.array(
      // [[lat, lng], [lat, lng]]
      // lower left, upper right
      v.array(v.number())
    ),
  })
});
