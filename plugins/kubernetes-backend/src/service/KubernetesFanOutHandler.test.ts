/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getVoidLogger } from '@backstage/backend-common';
import {
  ClusterDetails,
  CustomResource,
  FetchResponseWrapper,
  ObjectFetchParams,
} from '../types/types';
import { KubernetesFanOutHandler } from './KubernetesFanOutHandler';

const fetchObjectsForService = jest.fn();
const fetchPodMetricsByNamespaces = jest.fn();

const getClustersByEntity = jest.fn();

const POD_METRICS_FIXTURE = {
  containers: [],
  cpu: {
    currentUsage: 100,
    limitTotal: 102,
    requestTotal: 101,
  },
  memory: {
    currentUsage: '1000',
    limitTotal: '1002',
    requestTotal: '1001',
  },
  pod: {},
};

const mockFetch = (mock: jest.Mock) => {
  mock.mockImplementation((params: ObjectFetchParams) =>
    Promise.resolve(
      generateMockResourcesAndErrors(
        params.serviceId,
        params.clusterDetails.name,
      ),
    ),
  );
};

const mockMetrics = (mock: jest.Mock) => {
  mock.mockImplementation(
    (clusterDetails: ClusterDetails, namespaces: Set<string>) =>
      Promise.resolve(generatePodStatus(clusterDetails.name, namespaces)),
  );
};

const entity = {
  apiVersion: 'backstage.io/v1beta1',
  kind: 'Component',
  metadata: {
    name: 'test-component',
    annotations: {
      'backstage.io/kubernetes-labels-selector':
        'backstage.io/test-label=test-component',
    },
  },
  spec: {
    type: 'service',
    lifecycle: 'production',
    owner: 'joe',
  },
};

const cluster1 = {
  name: 'test-cluster',
  displayName: 'some-name',
  authProvider: 'serviceAccount',
  customResources: [
    {
      group: 'some-other-crd.example.com',
      apiVersion: 'v1alpha1',
      plural: 'some-crd-only-on-this-cluster',
    },
  ],
};

const cluster2 = {
  name: 'cluster-two',
  authProvider: 'serviceAccount',
  customResources: [
    {
      group: 'crd-two.example.com',
      apiVersion: 'v1alpha1',
      plural: 'crd-two-plural',
    },
  ],
};

function resourcesByCluster(clusterName: string) {
  return [
    {
      resources: [
        {
          metadata: {
            name: `my-pods-test-component-${clusterName}`,
            namespace: `ns-test-component-${clusterName}`,
          },
        },
      ],
      type: 'pods',
    },
    {
      resources: [
        {
          metadata: {
            name: `my-configmaps-test-component-${clusterName}`,
            namespace: `ns-test-component-${clusterName}`,
          },
        },
      ],
      type: 'configmaps',
    },
    {
      resources: [
        {
          metadata: {
            name: `my-services-test-component-${clusterName}`,
            namespace: `ns-test-component-${clusterName}`,
          },
        },
      ],
      type: 'services',
    },
  ];
}

function mockFetchAndGetKubernetesFanOutHandler(
  customResources: CustomResource[],
) {
  mockFetch(fetchObjectsForService);
  mockMetrics(fetchPodMetricsByNamespaces);

  return getKubernetesFanOutHandler(customResources);
}

function getKubernetesFanOutHandler(customResources: CustomResource[]) {
  return new KubernetesFanOutHandler({
    logger: getVoidLogger(),
    fetcher: {
      fetchObjectsForService,
      fetchPodMetricsByNamespaces,
    },
    serviceLocator: {
      getClustersByEntity,
    },
    customResources: customResources,
  });
}

function generatePodStatus(
  _clusterName: string,
  _namespaces: Set<string>,
): FetchResponseWrapper {
  return {
    errors: [],
    responses: Array.from(_namespaces).map(() => {
      return {
        type: 'podstatus',
        resources: [
          {
            Pod: {},
            CPU: {
              CurrentUsage: 100,
              RequestTotal: 101,
              LimitTotal: 102,
            },
            Memory: {
              CurrentUsage: BigInt('1000'),
              RequestTotal: BigInt('1001'),
              LimitTotal: BigInt('1002'),
            },
            Containers: [],
          },
        ],
      };
    }),
  };
}

function generateMockResourcesAndErrors(
  serviceId: string,
  clusterName: string,
) {
  if (clusterName === 'empty-cluster') {
    return {
      errors: [],
      responses: [
        {
          type: 'pods',
          resources: [],
        },
        {
          type: 'configmaps',
          resources: [],
        },
        {
          type: 'services',
          resources: [],
        },
      ],
    };
  } else if (clusterName === 'error-cluster') {
    return {
      errors: ['some random cluster error'],
      responses: [
        {
          type: 'pods',
          resources: [],
        },
        {
          type: 'configmaps',
          resources: [],
        },
        {
          type: 'services',
          resources: [],
        },
      ],
    };
  }

  return {
    errors: [],
    responses: [
      {
        type: 'pods',
        resources: [
          {
            metadata: {
              name: `my-pods-${serviceId}-${clusterName}`,
              namespace: `ns-${serviceId}-${clusterName}`,
            },
          },
        ],
      },
      {
        type: 'configmaps',
        resources: [
          {
            metadata: {
              name: `my-configmaps-${serviceId}-${clusterName}`,
              namespace: `ns-${serviceId}-${clusterName}`,
            },
          },
        ],
      },
      {
        type: 'services',
        resources: [
          {
            metadata: {
              name: `my-services-${serviceId}-${clusterName}`,
              namespace: `ns-${serviceId}-${clusterName}`,
            },
          },
        ],
      },
    ],
  };
}

describe('getKubernetesObjectsByEntity', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('retrieve objects for one cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {},
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(1);
    expect(fetchPodMetricsByNamespaces.mock.calls.length).toBe(1);
    expect(fetchPodMetricsByNamespaces.mock.calls[0][1]).toStrictEqual(
      new Set(['ns-test-component-test-cluster']),
    );

    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('test-cluster'),
        },
      ],
    });
  });

  it('retrieve objects for one cluster using customResources per cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [cluster1],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {},
    });

    expect(fetchObjectsForService.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls[0][0].customResources.length).toBe(
      1,
    );
  });

  it('retrieve objects for two cluster using customResources per cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [cluster1, cluster2],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {},
    });

    expect(fetchObjectsForService.mock.calls.length).toBe(2);
    expect(
      fetchObjectsForService.mock.calls[0][0].customResources[0].group,
    ).toBe('some-other-crd.example.com');
    expect(
      fetchObjectsForService.mock.calls[1][0].customResources[0].group,
    ).toBe('crd-two.example.com');
  });

  it('retrieve objects for two cluster using customResources globally and per cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
          cluster2,
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([
      {
        objectType: 'customresources',
        group: 'some-group',
        apiVersion: 'v2',
        plural: 'things',
      },
    ]);

    await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {},
    });

    expect(fetchObjectsForService.mock.calls.length).toBe(2);
    expect(
      fetchObjectsForService.mock.calls[0][0].customResources[0].group,
    ).toBe('some-group');
    expect(
      fetchObjectsForService.mock.calls[1][0].customResources[0].group,
    ).toBe('crd-two.example.com');
  });

  it('dont call top for the same namespace twice', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
        ],
      }),
    );

    fetchObjectsForService.mockImplementation((_: ObjectFetchParams) =>
      Promise.resolve({
        errors: [],
        responses: [
          {
            type: 'pods',
            resources: [
              {
                metadata: {
                  name: `pod1`,
                  namespace: `ns-a`,
                },
              },
              {
                metadata: {
                  name: `pod2`,
                  namespace: `ns-a`,
                },
              },
              {
                metadata: {
                  name: `pod3`,
                  namespace: `ns-b`,
                },
              },
            ],
          },
        ],
      }),
    );

    mockMetrics(fetchPodMetricsByNamespaces);

    const sut = getKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {},
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(1);
    expect(fetchPodMetricsByNamespaces.mock.calls.length).toBe(1);
    expect(fetchPodMetricsByNamespaces.mock.calls[0][1]).toStrictEqual(
      new Set(['ns-a', 'ns-b']),
    );

    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE, POD_METRICS_FIXTURE],
          resources: [
            {
              resources: [
                {
                  metadata: {
                    name: 'pod1',
                    namespace: 'ns-a',
                  },
                },
                {
                  metadata: {
                    name: 'pod2',
                    namespace: 'ns-a',
                  },
                },
                {
                  metadata: {
                    name: 'pod3',
                    namespace: 'ns-b',
                  },
                },
              ],
              type: 'pods',
            },
          ],
        },
      ],
    });
  });

  it('retrieve objects for two clusters', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
            dashboardUrl: 'https://k8s.foo.coom',
          },
          {
            name: 'other-cluster',
            authProvider: 'google',
          },
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {
        google: 'google_token_123',
      },
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(2);
    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            dashboardUrl: 'https://k8s.foo.coom',
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('test-cluster'),
        },
        {
          cluster: {
            name: 'other-cluster',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('other-cluster'),
        },
      ],
    });
  });
  it('retrieve objects for three clusters, only two have resources and show in ui', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
          {
            name: 'other-cluster',
            authProvider: 'google',
          },
          {
            name: 'empty-cluster',
            authProvider: 'google',
          },
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {
        google: 'google_token_123',
      },
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(3);
    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('test-cluster'),
        },
        {
          cluster: {
            name: 'other-cluster',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('other-cluster'),
        },
      ],
    });
  });
  it('retrieve objects for four clusters, two have resources and one error cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
          {
            name: 'other-cluster',
            authProvider: 'google',
          },
          {
            name: 'empty-cluster',
            authProvider: 'google',
          },
          {
            name: 'error-cluster',
            authProvider: 'google',
          },
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {
        google: 'google_token_123',
      },
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(4);
    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('test-cluster'),
        },
        {
          cluster: {
            name: 'other-cluster',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('other-cluster'),
        },
        {
          cluster: {
            name: 'error-cluster',
          },
          errors: ['some random cluster error'],
          podMetrics: [],
          resources: [
            {
              type: 'pods',
              resources: [],
            },
            {
              type: 'configmaps',
              resources: [],
            },
            {
              type: 'services',
              resources: [],
            },
          ],
        },
      ],
    });
  });
  it('retrieve objects for two clusters, one fails to fetch pod metrics', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
            dashboardUrl: 'https://k8s.foo.coom',
          },
          {
            name: 'other-cluster',
            authProvider: 'google',
          },
        ],
      }),
    );

    mockFetch(fetchObjectsForService);

    // To simulate the partial failure, return a valid response for the first call,
    // and an error for the second call.
    fetchPodMetricsByNamespaces
      .mockImplementationOnce(
        (clusterDetails: ClusterDetails, namespaces: Set<string>) =>
          Promise.resolve(generatePodStatus(clusterDetails.name, namespaces)),
      )
      .mockResolvedValueOnce({
        errors: [
          {
            errorType: 'NOT_FOUND',
            resourcePath: '/some/path',
            statusCode: 404,
          },
        ],
        responses: [],
      });

    const sut = getKubernetesFanOutHandler([]);

    const result = await sut.getKubernetesObjectsByEntity({
      entity,
      auth: {
        google: 'google_token_123',
      },
    });

    expect(getClustersByEntity.mock.calls.length).toBe(1);
    expect(fetchObjectsForService.mock.calls.length).toBe(2);
    expect(result).toStrictEqual({
      items: [
        {
          cluster: {
            dashboardUrl: 'https://k8s.foo.coom',
            name: 'test-cluster',
            displayName: 'some-name',
          },
          errors: [],
          podMetrics: [POD_METRICS_FIXTURE],
          resources: resourcesByCluster('test-cluster'),
        },
        {
          cluster: {
            name: 'other-cluster',
          },
          errors: [
            {
              errorType: 'NOT_FOUND',
              resourcePath: '/some/path',
              statusCode: 404,
            },
          ],
          podMetrics: [],
          resources: resourcesByCluster('other-cluster'),
        },
      ],
    });
  });
});

describe('getCustomResourcesByEntity', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('retrieve objects for one cluster using customResources per cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [cluster1],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([]);

    await sut.getCustomResourcesByEntity({
      entity,
      auth: {},
      customResources: [
        {
          group: 'parameter-crd.example.com',
          apiVersion: 'v1alpha1',
          plural: 'parameter-crd',
        },
      ],
    });

    expect(fetchObjectsForService.mock.calls.length).toBe(1);
    expect(
      fetchObjectsForService.mock.calls[0][0].customResources[0].plural,
    ).toBe('parameter-crd');
  });

  it('retrieve objects for two cluster using customResources globally and per cluster', async () => {
    getClustersByEntity.mockImplementation(() =>
      Promise.resolve({
        clusters: [
          {
            name: 'test-cluster',
            displayName: 'some-name',
            authProvider: 'serviceAccount',
          },
          cluster2,
        ],
      }),
    );

    const sut = mockFetchAndGetKubernetesFanOutHandler([
      {
        objectType: 'customresources',
        group: 'some-group',
        apiVersion: 'v2',
        plural: 'things',
      },
    ]);

    await sut.getCustomResourcesByEntity({
      entity,
      auth: {},
      customResources: [
        {
          group: 'parameter-crd.example.com',
          apiVersion: 'v1alpha1',
          plural: 'parameter-crd',
        },
      ],
    });

    expect(fetchObjectsForService.mock.calls.length).toBe(2);
    expect(
      fetchObjectsForService.mock.calls[0][0].customResources[0].group,
    ).toBe('parameter-crd.example.com');
    expect(
      fetchObjectsForService.mock.calls[1][0].customResources[0].group,
    ).toBe('parameter-crd.example.com');
  });
});
