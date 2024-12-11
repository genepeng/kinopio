import { ServiceBase, RpcMethod, RpcContext, RpcError, Kinopio } from '..';
import { camelizeKeys } from 'humps';

interface TestService extends ServiceBase {
  ping: RpcMethod;
  repeat: RpcMethod;
  get_some_data: RpcMethod;
  get_some_xjson_data: RpcMethod;
  raise_noraml_exception: RpcMethod;
  raise_custom_exception: RpcMethod;
  return_worker_ctx: RpcMethod;
}

interface TestContext {
  test_service: TestService;
}

const hostname = process.env.RABBIT_SERVER;
const port = parseInt(process.env.RABBIT_PORT as string, 10);
const vhost = process.env.RABBIT_VHOST;
const username = process.env.RABBIT_USER;
const password = process.env.RABBIT_PASS;
const namekoWorkerCtx = {
  'nameko.authorization': 'testAuthorization',
  'nameko.language': 'en-us',
  'nameko.locale': 'en-us',
};

describe('rpc', () => {
  const kinopio = new Kinopio('kinopio', {
    hostname,
    port,
    vhost,
    username,
    password,
    logger: () => {},
    requestLogger: () => {},
    responseLogger: () => {},
  });

  let rpc: RpcContext<TestContext>;
  beforeAll(async () => {
    await kinopio.connect();
    rpc = await kinopio.buildRpcProxy(namekoWorkerCtx);
  });
  afterAll(() => kinopio.close());

  test('can make a basic rpc call', async () => {
    await expect(rpc.test_service.ping()).resolves.toBe('pong');
  });

  test('passes default args and kwargs', async () => {
    const args = [1, 2, 3];
    const kwargs = { foo: 'bar' };
    await expect(rpc.test_service.repeat({ args, kwargs })).resolves.toEqual({
      args,
      kwargs,
    });
  });

  test('can get serialised data', async () => {
    await expect(rpc.test_service.get_some_data()).resolves.toEqual({
      int: 1,
      float: 0.01,
      string: 'foo',
      boolean: true,
      array: [1, 2, 3],
      object: { key: 'value' },
    });
  });

  test('can get serialised xjson data', async () => {
    const result = await rpc.test_service.get_some_xjson_data();
    console.log('result: ', result);
    expect(result).toEqual({
      datetime: '2018-01-01T01:01:01',
      date: '2018-05-29',
      decimal: '3.1415',
      int: 1,
      float: 0.01,
      string: 'foo',
      boolean: true,
      array: [1, 2, 3],
      object: { key: 'value' },
    });
  });

  test('rejects a normal exception', async () => {
    await expect(
      rpc.test_service.raise_noraml_exception(),
    ).rejects.toMatchObject(
      new RpcError(
        'normal exception',
        ['normal exception'],
        'Exception',
        'builtins.Exception',
      ),
    );
  });

    test('rejects a custom exception', async () => {
      await expect(
        rpc.test_service.raise_custom_exception(),
      ).rejects.toMatchObject(
        new RpcError(
          'custom exception',
          ['custom exception'],
          'CustomException',
          'service.CustomException',
        ),
      );
    });

    test('passes context', async () => {
      const res = await rpc.test_service.return_worker_ctx();
      expect(res.authorization).toEqual('testAuthorization');
      expect(res.language).toEqual('en-us');
      expect(res.locale).toEqual('en-us');
    });

    test('return workerCtx', async () => {
      expect(rpc.workerCtx['nameko.authorization']).toEqual('testAuthorization');
      expect(rpc.workerCtx['nameko.language']).toEqual('en-us');
      expect(rpc.workerCtx['nameko.locale']).toEqual('en-us');
    });
  });

  describe('hooks', () => {
    const onRequest = jest.fn();
    const onResponse = jest.fn();
    const processResponse = jest.fn((result) => camelizeKeys(result));

    const kinopio = new Kinopio('kinopio', {
      hostname,
      port,
      vhost,
      username,
      password,
      onRequest,
      onResponse,
      processResponse,
      logger: () => {},
      requestLogger: () => {},
      responseLogger: () => {},
    });
    let rpc: RpcContext<TestContext>;
    beforeAll(async () => {
      await kinopio.connect();
      rpc = await kinopio.buildRpcProxy(namekoWorkerCtx);
    });
    afterAll(() => kinopio.close());

    test('calls onResquest', async () => {
      await rpc.test_service.ping();

      expect(onRequest).toHaveBeenCalledWith('test_service', 'ping', {
        args: [],
        kwargs: {},
      });
    });

    test('call onResquest with args', async () => {
      await rpc.test_service.repeat({ args: [1], kwargs: { foo: 'bar' } });

      expect(onRequest).toHaveBeenCalledWith('test_service', 'repeat', {
        args: [1],
        kwargs: { foo: 'bar' },
      });
    });

    test('call onResponse', async () => {
      await rpc.test_service.ping();
      expect(onResponse).toHaveBeenCalledWith('pong');
    });

    test('processes the responce', async () => {
      const kwargs = { some_key: 'foo' };

      const responce = await rpc.test_service.repeat({
        kwargs,
      });
      expect(processResponse).toHaveBeenCalledWith({ kwargs, args: [] });
      expect(responce).toEqual({ args: [], kwargs: { someKey: 'foo' } });
    });
});
