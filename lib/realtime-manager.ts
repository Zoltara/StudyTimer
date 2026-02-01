// Real-time subscription manager for optimized performance
import { supabase } from './supabase';

export class RealtimeManager {
  private channels: Map<string, any> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  async createChannel(
    channelName: string, 
    config: any = {}, 
    subscriptions: Array<{
      event: string;
      schema?: string;
      table?: string;
      filter?: string;
      callback: (payload: any) => void;
    }> = []
  ) {
    // Clean up existing channel if it exists
    this.removeChannel(channelName);

    const channel = supabase.channel(channelName, config);

    // Add all subscriptions
    for (const sub of subscriptions) {
      if (sub.event === 'broadcast') {
        channel.on('broadcast', { event: sub.table }, sub.callback);
      } else {
        channel.on(
          'postgres_changes',
          {
            event: sub.event as any,
            schema: sub.schema || 'public',
            table: sub.table || '',
            filter: sub.filter
          },
          sub.callback
        );
      }
    }

    // Subscribe with retry logic
    const subscribe = () => {
      channel.subscribe((status: string, err?: any) => {
        console.log(`Channel ${channelName} status:`, status);
        
        if (status === 'SUBSCRIBED') {
          this.retryAttempts.set(channelName, 0);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Channel ${channelName} error:`, err);
          this.handleChannelError(channelName, channel);
        } else if (status === 'CLOSED') {
          console.log(`Channel ${channelName} closed`);
          this.retryConnection(channelName, channel);
        }
      });
    };

    subscribe();
    this.channels.set(channelName, channel);
    return channel;
  }

  private handleChannelError(channelName: string, channel: any) {
    const attempts = this.retryAttempts.get(channelName) || 0;
    
    if (attempts < this.maxRetries) {
      this.retryAttempts.set(channelName, attempts + 1);
      setTimeout(() => {
        console.log(`Retrying channel ${channelName} (attempt ${attempts + 1})`);
        this.retryConnection(channelName, channel);
      }, this.retryDelay * Math.pow(2, attempts)); // Exponential backoff
    } else {
      console.error(`Max retries reached for channel ${channelName}`);
      this.removeChannel(channelName);
    }
  }

  private retryConnection(channelName: string, channel: any) {
    try {
      channel.unsubscribe();
      setTimeout(() => {
        channel.subscribe();
      }, 1000);
    } catch (error) {
      console.error(`Error retrying channel ${channelName}:`, error);
    }
  }

  removeChannel(channelName: string) {
    const channel = this.channels.get(channelName);
    if (channel) {
      try {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      } catch (error) {
        console.warn(`Error removing channel ${channelName}:`, error);
      }
      this.channels.delete(channelName);
      this.retryAttempts.delete(channelName);
    }
  }

  removeAllChannels() {
    for (const [channelName] of this.channels) {
      this.removeChannel(channelName);
    }
  }

  getChannelStatus(channelName: string) {
    const channel = this.channels.get(channelName);
    return channel ? channel.state : 'not_found';
  }

  // Broadcast to a channel
  async broadcast(channelName: string, event: string, payload: any) {
    const channel = this.channels.get(channelName);
    if (channel) {
      try {
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        });
      } catch (error) {
        console.error(`Error broadcasting to ${channelName}:`, error);
      }
    }
  }
}

// Singleton instance
export const realtimeManager = new RealtimeManager();