"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

function StreamCard({ streamUrl }: { streamUrl: string }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Live Stream
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        </CardTitle>
        <CardDescription>Watching: {new URL(streamUrl).hostname}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="aspect-video relative">
          <iframe
            src={streamUrl}
            className="w-full h-full rounded-lg"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ChatCard({
  messages,
  onSendMessage,
  isModerator,
}: {
  messages: Array<{ id: string; author: string; message: string; isModerator: boolean }>;
  onSendMessage: (message: string) => void;
  isModerator: boolean;
}) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Chat {isModerator && <span className="text-purple-500">(Moderator)</span>}</CardTitle>
      </CardHeader>
      <CardContent className="h-48 overflow-y-auto">
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-2 text-sm">
              <span className="font-medium text-purple-500">{msg.author}:</span>
              <span className="flex-1">{msg.message}</span>
              {msg.isModerator && <span className="text-purple-500">⭐</span>}
            </div>
          ))}
        </div>
      </CardContent>
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 p-2 border rounded"
            placeholder="Type a message..."
          />
          <PurpleButton type="submit">Send</PurpleButton>
        </form>
      </div>
    </Card>
  );
}

export default function Frame({ streamUrl }: { streamUrl: string }) {
  const { data: session } = useSession();
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [messages, setMessages] = useState<Array<{ id: string; author: string; message: string; isModerator: boolean }>>([]);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on(CHAT_MESSAGE_EVENT, (message) => {
        setMessages(prev => [...prev, message]);
      });

      if (session?.user?.fid) {
        setCurrentUserFid(session.user.fid);
      }

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-full max-w-[600px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-700 dark:text-gray-300">
          {PROJECT_TITLE}
        </h1>
        <StreamCard streamUrl={streamUrl} />
        <ChatCard
          messages={messages}
          onSendMessage={(message) => {
            const newMessage = {
              id: Date.now().toString(),
              author: currentUserFid ? `User ${truncateAddress(currentUserFid.toString())}` : 'Guest',
              message,
              isModerator: currentUserFid === Number(new URL(streamUrl).searchParams.get('caster_fid'))
            };
            setMessages(prev => [...prev, newMessage]);
            sdk.actions.emit(CHAT_MESSAGE_EVENT, newMessage);
          }}
          isModerator={currentUserFid === Number(new URL(streamUrl).searchParams.get('caster_fid'))}
        />
      </div>
    </div>
  );
}
