import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Edge Function to handle database webhooks and send Push Notifications via Firebase Cloud Messaging (FCM)
// Setup requires FIREBASE_SERVER_KEY and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY to be set in Edge Function secrets.

serve(async (req) => {
  try {
    const payload = await req.json()

    // Assuming webhook from 'service_offers' or 'matches'
    // Extract user_id that needs to receive the notification
    let targetUserId = null;
    let title = "Oyna";
    let body = "Yeni bir bildiriminiz var.";

    if (payload.table === 'service_offers' && payload.type === 'INSERT') {
      targetUserId = payload.record.goalkeeper_id || payload.record.referee_id;
      title = "Yeni Maç Teklifi!";
      body = "Bir maça davet edildin. Detayları görmek için dokun.";
    } else if (payload.table === 'service_offers' && payload.type === 'UPDATE') {
      if (payload.record.status === 'ACCEPTED' && payload.old_record.status !== 'ACCEPTED') {
         targetUserId = payload.record.captain_id; // Inform captain that offer was accepted
         title = "Teklif Kabul Edildi";
         body = "Oyuncu teklifinizi kabul etti.";
      }
    }

    if (!targetUserId) {
      return new Response("No target user", { status: 200 })
    }

    // Initialize Supabase admin client to read push_token from profiles
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('push_token')
      .eq('id', targetUserId)
      .single()

    if (error || !profile?.push_token) {
      return new Response("User has no push token", { status: 200 })
    }

    // Send FCM request
    const fcmServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!fcmServerKey) {
      throw new Error("FIREBASE_SERVER_KEY not configured");
    }

    const fcmPayload = {
      to: profile.push_token,
      notification: {
        title: title,
        body: body,
        sound: "default"
      },
      data: {
        type_key: "system",
        match_id: payload.record.match_id || ""
      }
    };

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${fcmServerKey}`
      },
      body: JSON.stringify(fcmPayload)
    });

    const result = await response.json();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
