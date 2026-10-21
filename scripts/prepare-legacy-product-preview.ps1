$ErrorActionPreference = "Stop"

$SourceJson = "D:\Watchout-Backups\WatchOut-POS-Modular-Migration\legacy-products-20261016-210345.json"
$OutputDirectory = "D:\Watchout-Backups\WatchOut-POS-Modular-Migration"
$BusinessId = "local-demo-business"

if (-not (Test-Path -LiteralPath $SourceJson)) {
    throw "Legacy JSON was not found: $SourceJson"
}

$LegacyData = Get-Content -LiteralPath $SourceJson -Raw | ConvertFrom-Json
$LegacyProducts = @($LegacyData.products)

if ($LegacyProducts.Count -eq 0) {
    throw "No products were found in the legacy JSON products collection."
}

function Convert-ToMoney {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Amount
    )

    $Value = [decimal]$Amount

    if ($Value -lt 0) {
        throw "Negative monetary value: $Value"
    }

    if ([decimal]::Round($Value, 2) -ne $Value) {
        throw "Monetary value has more than two decimal places: $Value"
    }

    $MinorUnits = $Value * 100

    if ($MinorUnits -gt [long]::MaxValue) {
        throw "Monetary value is too large: $Value"
    }

    return [ordered]@{
        amountMinor = [long]$MinorUnits
        currency    = "INR"
    }
}

function Convert-ToBoolean {
    param([object]$Value)

    if ($Value -eq 0) { return $false }
    if ($Value -eq 1) { return $true }

    throw "Expected legacy boolean value 0 or 1; received '$Value'."
}

$Products = [System.Collections.Generic.List[object]]::new()
$Errors = [System.Collections.Generic.List[string]]::new()
$Warnings = [System.Collections.Generic.List[string]]::new()
$SeenSkus = @{}

foreach ($Legacy in $LegacyProducts) {
    try {
        $Name = [string]$Legacy.name
        $Sku = [string]$Legacy.sku

        if ([string]::IsNullOrWhiteSpace($Name)) {
            throw "Product name is empty."
        }

        if ([string]::IsNullOrWhiteSpace($Sku)) {
            throw "SKU is empty for product '$Name'."
        }

        $SkuKey = $Sku.Trim().ToLowerInvariant()

        if ($SeenSkus.ContainsKey($SkuKey)) {
            throw "Duplicate SKU '$Sku' in legacy source."
        }

        $SeenSkus[$SkuKey] = $true

        $ProductType = switch ([string]$Legacy.product_type) {
            "FINISHED_GOOD"       { "finished-good"; break }
            "INGREDIENT_RAW_MATERIAL" { "ingredient-raw-material"; break }
            "INTERMEDIATE_PRODUCT" { "intermediate-product"; break }
            "ASSEMBLED_PRODUCT"    { "assembled-product"; break }
            default { throw "Unsupported product type '$($Legacy.product_type)' for '$Name'." }
        }

        $InventoryMode = switch ([string]$Legacy.inventory_mode) {
            "STOCKED"        { "stocked"; break }
            "MADE_TO_ORDER"  { "made-to-order"; break }
            "BATCH_PRODUCED" { "batch-produced"; break }
            "NON_STOCKED"    { "non-stocked"; break }
            default { throw "Unsupported inventory mode '$($Legacy.inventory_mode)' for '$Name'." }
        }

        $Unit = switch ([string]$Legacy.unit) {
            { $_ -in @("PCS", "PC", "EACH", "UNIT") } { "each"; break }
            "G"  { "g"; break }
            "KG" { "kg"; break }
            "ML" { "ml"; break }
            "L"  { "l"; break }
            default { throw "Unsupported unit '$($Legacy.unit)' for '$Name'." }
        }

        $CostPrice = $null
        if ($null -ne $Legacy.cost_price -and "$($Legacy.cost_price)" -ne "") {
            $CostPrice = Convert-ToMoney $Legacy.cost_price
        }

        $Mrp = $null
        if ($null -ne $Legacy.mrp -and "$($Legacy.mrp)" -ne "") {
            $Mrp = Convert-ToMoney $Legacy.mrp
        }

        $Gst = [double]$Legacy.gst_percentage

        if ($Gst -lt 0 -or $Gst -gt 100) {
            throw "GST is outside the allowed 0-100 range for '$Name'."
        }

        $HsnSac = $null
        if (-not [string]::IsNullOrWhiteSpace([string]$Legacy.hsn_sac)) {
            $HsnSac = ([string]$Legacy.hsn_sac).Trim()
        }
        else {
            $Warnings.Add("$Name ($Sku): HSN/SAC is blank in the source.")
        }

        $Product = [ordered]@{
            businessId             = $BusinessId
            name                   = $Name.Trim()
            sku                    = $Sku.Trim()
            barcode                = if ([string]::IsNullOrWhiteSpace([string]$Legacy.barcode)) { $null } else { ([string]$Legacy.barcode).Trim() }
            productType            = $ProductType
            inventoryMode          = $InventoryMode
            unitOfMeasure          = $Unit
            availableForDirectSale = Convert-ToBoolean $Legacy.is_saleable
            sellingPrice           = Convert-ToMoney $Legacy.selling_price
            costPrice              = $CostPrice
            gstPercentage          = $Gst
            mrp                    = $Mrp
            hsnSac                 = $HsnSac
            taxInclusive           = Convert-ToBoolean $Legacy.tax_inclusive
            isActive               = Convert-ToBoolean $Legacy.is_active
        }

        $Products.Add($Product)
    }
    catch {
        $Errors.Add("Legacy row ID $($Legacy.id), name '$($Legacy.name)': $($_.Exception.Message)")
    }
}

$DuplicateOutputSkus = @(
    $Products |
        Group-Object { $_.sku.Trim().ToLowerInvariant() } |
        Where-Object Count -gt 1
)

foreach ($Duplicate in $DuplicateOutputSkus) {
    $Errors.Add("Duplicate mapped SKU: $($Duplicate.Name)")
}

if ($Products.Count -ne $LegacyProducts.Count) {
    $Errors.Add("Source count ($($LegacyProducts.Count)) does not match mapped count ($($Products.Count)).")
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputPath = Join-Path $OutputDirectory "product-import-preview-commercial-$Timestamp.json"

if (Test-Path -LiteralPath $OutputPath) {
    throw "Output already exists; refusing to overwrite: $OutputPath"
}

$Status = "DRY_RUN_PASSED"
if ($Errors.Count -gt 0) {
    $Status = "DRY_RUN_FAILED"
}

$Preview = [ordered]@{
    status              = $Status
    source              = $SourceJson
    expectedSourceCount = $LegacyProducts.Count
    mappedCount         = $Products.Count
    businessId          = $BusinessId
    writesPerformed     = $false
    inventoryImported   = $false
    errors              = @($Errors.ToArray())
    warnings            = @($Warnings.ToArray())
    products            = @($Products.ToArray())
}

$Preview | ConvertTo-Json -Depth 12 |
    Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host "`n=== DRY-RUN RESULT ==="
Write-Host "Status:              $Status"
Write-Host "Source count:        $($LegacyProducts.Count)"
Write-Host "Mapped count:        $($Products.Count)"
Write-Host "Error count:         $($Errors.Count)"
Write-Host "Warning count:       $($Warnings.Count)"
Write-Host "Writes performed:    False"
Write-Host "Inventory imported:  False"
Write-Host "Preview file:        $OutputPath"

if ($Errors.Count -gt 0) {
    Write-Host "`n=== ERRORS ==="
    $Errors | ForEach-Object { Write-Host "ERROR: $_" }
}

if ($Warnings.Count -gt 0) {
    Write-Host "`n=== WARNINGS ==="
    $Warnings | ForEach-Object { Write-Host "WARNING: $_" }
}
