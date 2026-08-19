/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "commondataserviceforapps": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "GetOrganizations": {
        "path": "/{connectionId}/v1.0/$metadata.json/organizations",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetOrganizationsTest": {
        "path": "/{connectionId}/v1.0/$metadata.json/organizationsTest",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForGetEntity": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "selectedEntityAttributes",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "expandEntityAttributes",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForGetEntityWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/entities/{entityName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "selectedEntityAttributes",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "expandEntityAttributes",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForGetEntityCUDTrigger": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}/cudtrigger",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForGetEntityCUDTriggerWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/entities/{entityName}/cudtrigger",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetActivityPartyAttributes": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}/activityparties",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetActivityPartyAttributesWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetActivityPartyAttributesWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForPostEntity": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}/postitem",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForPostEntityWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/entities/{entityName}/postitem",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForPatchEntity": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}/patchitem",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForPatchEntityWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/entities/{entityName}/patchitem",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntityRelationships": {
        "path": "/{connectionId}/$metadata.json/entities/{entityName}/relationships",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntityRelationshipsWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetEntityRelationshipsWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetAttributeFilters": {
        "path": "/{connectionId}/entities/{entityName}/attributefilters",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "attributeTypeNames",
            "in": "header",
            "required": false,
            "type": "array"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetAttributeFiltersWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetAttributeFiltersWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetScopeFilters": {
        "path": "/{connectionId}/entities/{entityName}/scopefilters",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "array"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetScopeFiltersWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetScopeFiltersWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetOptionSetMetadata": {
        "path": "/{connectionId}/entities/{entityName}/attributes/{attributeMetadataId}/optionSets/{type}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "attributeMetadataId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetOptionSetMetadataWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetOptionSetMetadataWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetOptionSetMetadataWithEntitySetName": {
        "path": "/{connectionId}/entities/{entityName}/attributes/{attributeMetadataId}/optionSets/{type}/entitysetname",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "attributeMetadataId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetOptionSetMetadataWithEntitySetNameWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetOptionSetMetadataWithEntitySetNameWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntities": {
        "path": "/{connectionId}/api/data/v9.1/EntityDefinitions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntitiesWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetEntityListEnum/GetEntitiesWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "SubscribeWebhookTrigger": {
        "path": "/{connectionId}/api/data/v9.1/callbackregistrations",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Consistency",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionRequest",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "catalog",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "category",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "SubscribeWebhookTriggerWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/callbackregistrations",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "Consistency",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionRequest",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "catalog",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "category",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListRecords": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "$select",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$filter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$orderby",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$expand",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "fetchXml",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$top",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "$skiptoken",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateRecord": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "201": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListRecordsWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "MSCRM.IncludeMipSensitivityLabel",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "$select",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$filter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$orderby",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$expand",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "fetchXml",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$top",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "$skiptoken",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateRecordWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "201": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetItem": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "$select",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$expand",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteRecord": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateRecord": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateOnlyRecord": {
        "path": "/{connectionId}/api/data/v9.2/{entityName}({recordId})",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "If-Match",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetItemWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "MSCRM.IncludeMipSensitivityLabel",
            "in": "header",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "$select",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$expand",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteRecordWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "partitionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateRecordWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateOnlyRecordWithOrganization": {
        "path": "/{connectionId}/api/data/v9.2.0/{entityName}({recordId})",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "accept",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "If-Match",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-odata-metadata-full",
            "in": "header",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "Predict": {
        "path": "/{connectionId}/api/data/v9.0/msdyn_aimodels({modelId})/Microsoft.Dynamics.CRM.Predict",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "modelId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetPredictionSchema": {
        "path": "/{connectionId}/$metadata.json/api/data/v9.1/msdyn_aimodels({recordId})/Microsoft.Dynamics.CRM.PredictionSchema",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "predictionMode",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PredictV2": {
        "path": "/{connectionId}/api/data/v9.1/msdyn_aimodels({recordId})/Microsoft.Dynamics.CRM.Predict",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Prefer",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "AddToFeedbackLoop": {
        "path": "/{connectionId}/api/data/v9.1/msdyn_aimodels({recordId})/Microsoft.Dynamics.CRM.AddToFeedbackLoop",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PredictByReference": {
        "path": "/{connectionId}/api/data/v9.1/msdyn_aimodels({recordId})/Microsoft.Dynamics.CRM.PredictByReference",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "AssociateEntities": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})/{associationEntityRelationship}/$ref",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "associationEntityRelationship",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DisassociateEntities": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})/{associationEntityRelationship}/$ref",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "associationEntityRelationship",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "$id",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "AssociateEntitiesWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})/{associationEntityRelationship}/$ref",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "associationEntityRelationship",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DisassociateEntitiesWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})/{associationEntityRelationship}/$ref",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "associationEntityRelationship",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "$id",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForUnboundActionInput": {
        "path": "/{connectionId}/$metadata.json/flow/api/data/v9.1/{actionName}/inputs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForUnboundActionInputWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/actions/unbound/{actionName}/inputs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundActionInput": {
        "path": "/{connectionId}/$metadata.json/api/data/v9.1/{entityName}/{actionName}/inputs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundActionInputWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/actions/bound/{entityName}/{actionName}/inputs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundOrUnboundActionInput": {
        "path": "/{connectionId}/$metadata.json/api/data/v9.2/{entityName}/{actionName}/asyncinputs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundOrUnboundActionResponse": {
        "path": "/{connectionId}/$metadata.json/api/data/v9.2/{entityName}/{actionName}/asyncresponse",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForUnboundActionResponse": {
        "path": "/{connectionId}/$metadata.json/flow/api/data/v9.1/{actionName}/response",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForUnboundActionResponseWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/actions/unbound/{actionName}/response",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundActionResponse": {
        "path": "/{connectionId}/$metadata.json/api/data/v9.1/{entityName}/{actionName}/response",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForBoundActionResponseWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/actions/bound/{entityName}/{actionName}/response",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetUnboundActions": {
        "path": "/{connectionId}/flow/api/data/v9.1/actions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetUnboundActionsWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetActionListEnum/GetUnboundActionsWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetBoundActions": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}/actions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetBoundActionsWithOrganization": {
        "path": "/{connectionId}/v1.0/$metadata.json/GetActionListEnum/GetBoundActionsWithOrganization",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PerformUnboundAction": {
        "path": "/{connectionId}/flow/api/data/v9.1/{actionName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PerformUnboundActionWithOrganization": {
        "path": "/{connectionId}/flow/api/data/v9.1.0/{actionName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PerformBoundAction": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})/{actionName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PerformBoundActionWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})/{actionName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "RecordSelected": {
        "path": "/{connectionId}/hybridtriggers/entities/{entityName}/onrecordselected",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ExecuteChangeset": {
        "path": "/{connectionId}/api/data/v9.1/$batch",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          }
        }
      },
      "UpdateEntityFileImageFieldContent": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})/{fileImageFieldName}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "content-type",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileImageFieldName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-file-name",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateEntityFileImageFieldContentWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})/{fileImageFieldName}",
        "method": "PUT",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "content-type",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileImageFieldName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "x-ms-file-name",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntityFileImageFieldContent": {
        "path": "/{connectionId}/api/data/v9.1/{entityName}({recordId})/{fileImageFieldName}/$value",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Range",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileImageFieldName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "size",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntityFileImageFieldContentWithOrganization": {
        "path": "/{connectionId}/api/data/v9.1.0/{entityName}({recordId})/{fileImageFieldName}/$value",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Range",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "recordId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "fileImageFieldName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "size",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "string",
            "format": "binary"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "FlowStepRun": {
        "path": "/{connectionId}/hybridtriggers/onflowsteprun",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetRelevantRows": {
        "path": "/{connectionId}/api/search/v1.0/query",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "SearchRequest",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetCatalogs": {
        "path": "/{connectionId}/api/data/v9.2/catalogs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetCategories": {
        "path": "/{connectionId}/api/data/v9.2/catalog/{catalog}/categories",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntitiesForActionTrigger": {
        "path": "/{connectionId}/api/data/v9.2/catalog/{catalog}/category/{category}/entitiesForActionTrigger",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetEntitiesForBackgroundOperations": {
        "path": "/{connectionId}/api/data/v9.2/catalog/{catalog}/category/{category}/entitiesForBackgroundOperations",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetActionsForActionTrigger": {
        "path": "/{connectionId}/api/data/v9.2/catalog/{catalog}/category/{category}/entityForActionTrigger/{entity}/actions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entity",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetMetadataForActionInputAndResponseForWhenAnActionIsPerformedTrigger": {
        "path": "/{connectionId}/$metadata.json/whenAnActionIsPerformedEntity/{entityName}/whenAnActionIsPerformedAction/{actionName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "BusinessEventsTrigger": {
        "path": "/{connectionId}/api/data/v9.2/callbackregistrations",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Consistency",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionRequest",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "PerformBackgroundOperation": {
        "path": "/{connectionId}/api/data/v9.2/{actionName}",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "item",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "Consistency",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "x-ms-dyn-callback-url",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "entityName",
            "in": "header",
            "required": true,
            "type": "string"
          },
          {
            "name": "actionName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "202": {
            "type": "object"
          },
          "204": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetBackgroundOperations": {
        "path": "/{connectionId}/api/data/v9.2/GetBackgroundOperations(catalogUniqueName='{catalog}',categoryUniqueName='{category}',entityLogicalName='{entity}')",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "catalog",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "category",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "entity",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetNextPageWithOrganization": {
        "path": "/{connectionId}/nextLink",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "organization",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "next",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "400": {
            "type": "void"
          },
          "401": {
            "type": "void"
          },
          "403": {
            "type": "void"
          },
          "500": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "InvokeMCP": {
        "path": "/{connectionId}/api/mcp",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Mcp-Session-Id",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetInvokeMCP": {
        "path": "/{connectionId}/api/mcp",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Mcp-Session-Id",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "201": {
            "type": "object"
          }
        }
      },
      "InvokeMCPPreview": {
        "path": "/{connectionId}/api/mcp_preview",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Mcp-Session-Id",
            "in": "header",
            "required": false,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetInvokeMCPPreview": {
        "path": "/{connectionId}/api/mcp_preview",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "Mcp-Session-Id",
            "in": "header",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "201": {
            "type": "object"
          }
        }
      },
      "mcp_SalesMCPServer": {
        "path": "/{connectionId}/mcp/SalesMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "mcp_ServiceMCPServer": {
        "path": "/{connectionId}/mcp/ServiceMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "mcp_ERPMCPServer": {
        "path": "/{connectionId}/mcp/ERPMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "mcp_DataverseMCPServer": {
        "path": "/{connectionId}/mcp/DataverseMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "mcp_ContactCenterMCPServer": {
        "path": "/{connectionId}/mcp/ContactCenterMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "mcp_ConversationOrchestratorMCPServer": {
        "path": "/{connectionId}/mcp/ConversationOrchestratorMCPServer",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryRequest",
            "in": "body",
            "required": false,
            "type": "object"
          },
          {
            "name": "sessionId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      }
    }
  },
  "cycai_activities": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_activityid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "cycai_adoptions": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_adoptionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "environmentvariabledefinitions": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariabledefinitionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "environmentvariablevalues": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariablevalueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "cycai_links": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_linkid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "cycai_momentums": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_momentumid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "annotations": {
    "tableId": "",
    "version": "",
    "primaryKey": "annotationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "cycai_participations": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_participationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "cycai_votes": {
    "tableId": "",
    "version": "",
    "primaryKey": "cycai_voteid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "visualstudioteamservices": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "SearchWorkItemsAsync": {
        "path": "/{connectionId}/_apis/search/workitemsearchresults",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "searchRequest",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetBuildAsync": {
        "path": "/{connectionId}/{project}/_apis/build/builds/{buildId}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "buildId",
            "in": "path",
            "required": true,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetBuildTimelineAsync": {
        "path": "/{connectionId}/{project}/_apis/build/builds/{buildId}/timeline",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "buildId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "timelineId",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "changeId",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "planId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListAccounts": {
        "path": "/{connectionId}/_apis/Accounts",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetProfile": {
        "path": "/{connectionId}/_apis/profile/profiles/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListIterations": {
        "path": "/{connectionId}/{project}/iterations",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListBuildDefinitions": {
        "path": "/{connectionId}/{project}/_apis/build/definitions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListBuildBranchesAsync": {
        "path": "/{connectionId}/{project}/_apis/build/branches",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListBuilds": {
        "path": "/{connectionId}/{project}/_apis/build/builds",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "definitions",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "buildNumber",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "branchName",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "resultFilter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "statusFilter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "reasonFilter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "requestedFor",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "minTime",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "maxTime",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "$top",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "QueueNewBuild": {
        "path": "/{connectionId}/{project}/_apis/build/builds",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "buildDefId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "buildDetails",
            "in": "body",
            "required": false,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListBuildRequestersAsync": {
        "path": "/{connectionId}/{project}/_apis/build/requesters",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnBuildCompleted": {
        "path": "/{connectionId}/buildcompleted_trigger/{project}/_apis/build/builds",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "resultFilter",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "definitions",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateOnBuildCompletedSubscription": {
        "path": "/{connectionId}/hooks/onbuildcompleted/subscriptions",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscription",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionKind",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListGitRepositories": {
        "path": "/{connectionId}/{project}/_apis/git/repositories",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListGitRefs": {
        "path": "/{connectionId}/{project}/_apis/git/repositories/{repository}/refs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "repository",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnGitPush": {
        "path": "/{connectionId}/gitpushed_trigger/{project}/_apis/git/repositories/{repository}/pushes",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "repository",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "refName",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnGitPullCreated": {
        "path": "/{connectionId}/gitpullcreated_trigger/{project}/_apis/git/repositories/{repository}/pullrequests",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "repository",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "sourceRefName",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "targetRefName",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnGitPullClosed": {
        "path": "/{connectionId}/gitpullclosed_trigger/{project}/_apis/git/repositories/{repository}/pullrequests",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "repository",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "sourceRefName",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "targetRefName",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListProjects": {
        "path": "/{connectionId}/_apis/projects",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListTeams": {
        "path": "/{connectionId}/_apis/projects/{project}/teams",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListTeamMembers": {
        "path": "/{connectionId}/_apis/projects/{project}/teams/{team}/members",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListReleaseDefinitions": {
        "path": "/{connectionId}/{project}/definitions",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateRelease": {
        "path": "/{connectionId}/{project}/releases",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "releaseDefId",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "releaseStartMetadata",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetSubscriptionSchema": {
        "path": "/{connectionId}/hooks/subscriptionschema",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionKind",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemsSubscriptionSchema": {
        "path": "/{connectionId}/hooks/workitemssubscriptionschema",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemType",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionKind",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteSubscription": {
        "path": "/{connectionId}/hooks/subscriptions/{id}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "options",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnTfvcCheckIn": {
        "path": "/{connectionId}/tfvccheckin_trigger/_apis/tfvc/changesets",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "author",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "HttpRequest": {
        "path": "/{connectionId}/httprequest",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "parameters",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListWorkItemFieldsAsync": {
        "path": "/{connectionId}/_apis/wit/fields",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "expand",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListWorkItemTypes": {
        "path": "/{connectionId}/_apis/wit/workitemtypes",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemDetails": {
        "path": "/{connectionId}/_apis/wit/workitems/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateWorkItem": {
        "path": "/{connectionId}/_apis/wit/workitems/{id}",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItem",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "project",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemDetailsV2Async": {
        "path": "/{connectionId}/_apis/wit/v2/workitems/{id}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "asOf",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "expand",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemChildren": {
        "path": "/{connectionId}/_apis/wit/workitems/{id}/children",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemType",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemAttachmentAsync": {
        "path": "/{connectionId}/_apis/wit/attachments/{attachmentId}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "attachmentId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "fileName",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemCommentsAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/comments",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "$top",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "order",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "includeDeleted",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "$expand",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateWorkItemCommentAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/comments",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "comment",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "type",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "format",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      },
      "AddWorkItemLinkAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/links",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "linkRequest",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteWorkItemLinkAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/links/delete",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "linkRequest",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "UpdateWorkItemCommentAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/comments/{commentId}",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "commentId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "comment",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "format",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "DeleteWorkItemCommentAsync": {
        "path": "/{connectionId}/_apis/wit/workitems/{workItemId}/comments/{commentId}",
        "method": "DELETE",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemId",
            "in": "path",
            "required": true,
            "type": "integer"
          },
          {
            "name": "commentId",
            "in": "path",
            "required": true,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateWorkItem": {
        "path": "/{connectionId}/{project}/_apis/wit/workitems/${type}",
        "method": "PATCH",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "type",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItem",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "shouldReturnAllFields",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemAssigned": {
        "path": "/{connectionId}/workitemassigned_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_TeamProject",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemAssignedV2": {
        "path": "/{connectionId}/v2/workitemassigned_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemUpdated": {
        "path": "/{connectionId}/workitemupdated_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_TeamProject",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemUpdatedV2": {
        "path": "/{connectionId}/v2/workitemupdated_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemCreated": {
        "path": "/{connectionId}/workitemcreated_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_TeamProject",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemCreatedV2": {
        "path": "/{connectionId}/v2/workitemcreated_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemClosed": {
        "path": "/{connectionId}/workitemclosed_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_TeamProject",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "closedState",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "OnWorkItemClosedV2": {
        "path": "/{connectionId}/v2/workitemclosed_trigger/{project}/_apis/wit/wiql",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "team",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AssignedTo",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_WorkItemType",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "closedState",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_AreaPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "areaPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_IterationPath",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "iterationPathComparison",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__Microsoft_VSTS_Common_Priority",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "wiql__System_CreatedBy",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetQueryResults": {
        "path": "/{connectionId}/{project}/queryResults/{queryId}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryId",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetQueryResultsV2": {
        "path": "/{connectionId}/v2/{project}/queryResults/{queryId}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "queryId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemsCount",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "throwIfQueryChanged",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "queryHash",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "skip",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListRootQueryFolders": {
        "path": "/{connectionId}/{project}/queries",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListQueriesInFolder": {
        "path": "/{connectionId}/{project}/queriesInFolder",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "folderPath",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListWorkItems": {
        "path": "/{connectionId}/{project}/_apis/wit/workitems",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemIds",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemType",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemSchema": {
        "path": "/{connectionId}/_apis/wit/workitemschema/{typeName}",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemSchemaForCreate": {
        "path": "/{connectionId}/_apis/wit/workitemschemaforcreate",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "onlyRequiredFields",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetWorkItemSchemaForUpdate": {
        "path": "/{connectionId}/_apis/wit/workitemschemaforupdate",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "onlyRequiredFields",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetResponseWorkItemSchema": {
        "path": "/{connectionId}/_apis/wit/workitemschemaforresponse",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "typeName",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "convertReferenceName",
            "in": "query",
            "required": false,
            "type": "boolean"
          },
          {
            "name": "handlePredefinedSchema",
            "in": "query",
            "required": false,
            "type": "boolean"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetQueryResultWorkItemSchema": {
        "path": "/{connectionId}/_apis/wit/workitemschemaforqueryresult",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": false,
            "type": "string"
          },
          {
            "name": "queryId",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "RunWiqlQuery": {
        "path": "/{connectionId}/_apis/wit/wiql",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "query",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "CreateOnWorkItemUpdatedSubscription": {
        "path": "/{connectionId}/hooks/onworkitemupdated/subscriptions",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscription",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "workItemType",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "subscriptionKind",
            "in": "query",
            "required": false,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListPipelines": {
        "path": "/{connectionId}/codeless/{project}/_apis/pipelines",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "ListPipelineRuns": {
        "path": "/{connectionId}/codeless/{project}/_apis/pipelines/{pipelineId}/runs",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "account",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "project",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "pipelineId",
            "in": "path",
            "required": true,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "WebhookBuildsCallback": {
        "path": "/hookbuildscallback",
        "method": "POST",
        "parameters": [
          {
            "name": "state",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "WebhookWorkItemsCallback": {
        "path": "/hookworkitemscallback",
        "method": "POST",
        "parameters": [
          {
            "name": "state",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "void"
          },
          "default": {
            "type": "void"
          }
        }
      }
    }
  }
};
