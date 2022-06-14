# Sticky Notes

[![Build Status](https://dev.azure.com/jannemattila/jannemattila/_apis/build/status/JanneMattila.sticky-notes?branchName=main)](https://dev.azure.com/jannemattila/jannemattila/_build/latest?definitionId=66&branchName=main)
[![Docker Pulls](https://img.shields.io/docker/pulls/jannemattila/sticky-notes?style=plastic)](https://hub.docker.com/r/jannemattila/sticky-notes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sticky Notes is simple but yet handy web-based planning tool mimicking
[Sticky Notes](https://en.wikipedia.org/wiki/Post-it_Note).

![Example sticky notes plan](https://user-images.githubusercontent.com/2357647/171657965-c3b1d381-3a29-454a-bbcb-9e467a1ba137.png)

You can try it yourself here [https://stickynotes.jannemattila.com](https://stickynotes.jannemattila.com).

Just start typing to add new notes or right click using mouse
or long press if using touch.

To edit existing note, you can just double click on the note.

You can quickly enter many notes with `Ctrl+Enter` shortcut when typing
text to the note.

## Deploy

To deploy Sticky Notes to your own Azure subscription, you
can follow these instructions.

### Azure Container Apps

Azure CLI & Bash example:

```bash
resource_group_name="rg-sticky-notes"
location="northeurope"

container_app_name="stickynotes"
container_apps_environment_name="cae-apps"
workspace_name="log-apps"
storage_account_name="stca0000000001"
vnet_name="vnet-apps"
vnet_app_subnet_name="snet-apps"
vnet_address_prefix="10.0.0.0/23"

# Make sure extension is up to date
az extension add --name containerapp --upgrade --yes

# Create resource group
az group create --name $resource_group_name --location $location -o table

# Create virtual network for our Container Apps Environment
vnet_id=$(az network vnet create -g $resource_group_name --name $vnet_name \
  --address-prefix $vnet_address_prefix \
  --query newVNet.id -o tsv)

# Create subnet to virtual network
vnet_app_subnet_id=$(az network vnet subnet create -g $resource_group_name --vnet-name $vnet_name \
  --name $vnet_app_subnet_name --address-prefixes $vnet_address_prefix \
  --service-endpoints "Microsoft.Storage" \
  --query id -o tsv)

# Create Log Analytics workspace
workspace_customer_id=$(az monitor log-analytics workspace create \
  --workspace-name $workspace_name \
  --resource-group $resource_group_name \
  --query customerId -o tsv)
workspace_key=$(az monitor log-analytics workspace get-shared-keys \
  --workspace-name $workspace_name \
  --resource-group $resource_group_name \
  --query primarySharedKey -o tsv)

# Create Container Apps Environment
az containerapp env create \
  --name $container_apps_environment_name \
  --resource-group $resource_group_name \
  --infrastructure-subnet-resource-id $vnet_app_subnet_id \
  --logs-workspace-id $workspace_customer_id \
  --logs-workspace-key $workspace_key \
  --location $location

# Create Storage Account
storage_account_id=$(az storage account create \
  --name $storage_account_name \
  --resource-group $resource_group_name \
  --location $location \
  --default-action Deny \
  --allow-blob-public-access false \
  --subnet $vnet_app_subnet_id \
  --query id -o tsv)

storage_account_connection_string=$(az storage account show-connection-string \
  --name $storage_account_name \
  --resource-group $resource_group_name \
  --query connectionString -o tsv)

# Create Container App
container_app_json=$(az containerapp create \
  --name $container_app_name \
  --resource-group $resource_group_name \
  --environment $container_apps_environment_name \
  --image jannemattila/sticky-notes:latest \
  --cpu "0.25" \
  --memory "0.5Gi" \
  --ingress "external" \
  --target-port 80 \
  --min-replicas 0 \
  --max-replicas 1 \
  --secrets storage="$storage_account_connection_string" \
  --env-vars Storage=secretref:storage \
  -o json)

container_app_fqdn=$(echo $container_app_json | jq -r .properties.latestRevisionFqdn)
echo $container_app_fqdn

# Wipe out the resources
az group delete --name $resource_group_name -y
```

### Font

Sticky Notes uses [Rubik](https://fonts.google.com/specimen/Rubik) and it's licensed
under the [Open Font License](https://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=OFL).