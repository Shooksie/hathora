import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { HathoraClient, HathoraConnection, UpdateArgs } from "../../../.hathora/client";
import { ConnectionFailure } from "../../../.hathora/failures";
import { ToastContainer, toast } from "react-toastify";
import useSessionStorage from "../hooks/useSessionStorage";

import { Card, IInitializeRequest } from "../../../../api/types";
import { lookupUser, UserData, Response } from "../../../../api/base";

interface GameContext {
  token?: string;
  login: () => Promise<string | undefined>;
  connect: (gameId: string) => HathoraConnection;
  disconnect: () => void;
  createGame: () => Promise<string | undefined>;
  joinGame: (gameId: string) => Promise<void>;
  startGame: () => Promise<void>;
  playerState?: UpdateArgs["state"];
  connectionError?: ConnectionFailure;
  playCard: (card: Card) => Promise<void>;
  drawCard: () => Promise<void>;
  endGame: () => void;
  getUserName: (id: string) => string;
  user?: UserData;
  connecting?: boolean;
  loggingIn?: boolean;
}

interface AuthContextProviderProps {
  children: ReactNode | ReactNode[];
}
const client = new HathoraClient();

const HathoraContext = createContext<GameContext | null>(null);

const HandleConnection = async (prom: Promise<Response>) => {
  const response = await prom;

  if (response.type === "error") {
    toast.error(response.error, {
      position: "top-center",
      autoClose: 1000,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });
  }

  return response;
};

export default function HathoraContextProvider({ children }: AuthContextProviderProps) {
  const [token, setToken] = useSessionStorage<string>(client.appId);
  const [connection, setConnection] = useState<HathoraConnection>();
  const [playerState, setPlayerState] = useState<UpdateArgs["state"]>();
  const [events, setEvents] = useState<UpdateArgs["events"]>();
  const [connectionError, setConnectionError] = useState<ConnectionFailure>();
  const [connecting, setConnecting] = useState<boolean>();
  const [loggingIn, setLoggingIn] = useState<boolean>();
  const [playerNameMapping, setPlayerNameMapping] = useSessionStorage<Record<string, UserData>>(
    `${client.appId}_player_mapping`,
    {}
  );
  const [user, setUserInfo] = useState<UserData>();
  const isLoginIn = useRef(false);

  const login = async () => {
    if (!isLoginIn.current) {
      try {
        setLoggingIn(true);
        isLoginIn.current = true;
        const token = await client.loginAnonymous();
        if (token) {
          const user = HathoraClient.getUserFromToken(token);
          setUserInfo(user);
          setPlayerNameMapping((current) => ({ ...current, [user.id]: user }));
        }
        setToken(token);
        return token;
      } catch (e) {
        console.error(e);
      } finally {
        isLoginIn.current = false;
        setLoggingIn(false);
      }
    }
  };

  const connect = useCallback(
    (stateId: string) => {
      setConnecting(true);
      const connection = client.connect(
        token,
        stateId,
        ({ state }) => {
          setPlayerState(state);
          setConnecting(false);
        },
        (e) => {
          setConnectionError(e);
          setConnecting(false);
        }
      );
      setConnection(connection);
      return connection;
    },
    [token]
  );

  const disconnect = useCallback(() => {
    if (connection !== undefined) {
      connection.disconnect();
      setConnection(undefined);
      setPlayerState(undefined);
      setEvents(undefined);
      setConnectionError(undefined);
    }
  }, [connection]);

  const createGame = useCallback(async () => {
    if (token) {
      return await client.create(token, IInitializeRequest.default());
    } else {
      const token = await login();
      if (token) {
        return await client.create(token, IInitializeRequest.default());
      }

      // throw new Error("An Error occurred creating Game");
    }
  }, [token]);

  const joinGame = useCallback(
    async (gameId: string) => {
      const connection = await connect(gameId);
      await connection.joinGame({});
    },
    [token, connect]
  );

  const startGame = useCallback(async () => {
    if (connection) {
      await HandleConnection(connection.startGame({}));
    }
  }, [token, connection]);

  const playCard = useCallback(
    async (card: Card) => {
      if (connection) {
        await HandleConnection(connection.playCard({ card }));
      }
    },
    [connection]
  );

  const drawCard = useCallback(async () => {
    if (connection) {
      await HandleConnection(connection.drawCard({}));
    }
  }, [connection]);

  const endGame = () => {
    setPlayerState(undefined);
    connection?.disconnect();
  };

  useEffect(() => {
    if (connectionError) {
      toast.error(connectionError?.message);
    }
  }, [connectionError]);

  const getUserName = useCallback(
    (userId: string) => {
      if (Boolean(playerNameMapping[userId])) {
        return playerNameMapping[userId].name;
      } else {
        lookupUser(userId).then((response) => {
          setPlayerNameMapping((curr) => ({ ...curr, [userId]: response }));
        });
        return userId;
      }
    },
    [playerNameMapping]
  );

  useEffect(() => {
    if (token) {
      setUserInfo(HathoraClient.getUserFromToken(token));
    }
  }, [token]);

  useEffect(() => {
    if (playerState?.turn) {
      if (playerState?.turn === user?.id) {
        toast.success(`It's you turn`, { position: "top-center", hideProgressBar: true });
      } else {
        toast.info(`it is ${getUserName(playerState?.turn)}'s turn`, { position: "top-center", hideProgressBar: true });
      }
    }
  }, [playerState?.turn]);

  return (
    <HathoraContext.Provider
      value={{
        token,
        login,
        connect,
        connecting,
        joinGame,
        disconnect,
        createGame,
        playerState,
        connectionError,
        startGame,
        playCard,
        drawCard,
        loggingIn,
        user,
        endGame,
        getUserName,
      }}
    >
      {children}
      <ToastContainer
        autoClose={1000}
        limit={3}
        newestOnTop={true}
        position="top-center"
        pauseOnFocusLoss={false}
        hideProgressBar={true}
      />
    </HathoraContext.Provider>
  );
}

export function useHathoraContext() {
  const context = useContext(HathoraContext);
  if (!context) {
    throw new Error("Component must be within the Auth Context");
  }
  return context;
}
