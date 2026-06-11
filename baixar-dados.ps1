# baixar-dados.ps1
# Baixa users.json e palpites.json do servidor Render para a pasta local dados/
#
# Uso:
#   .\baixar-dados.ps1
#   .\baixar-dados.ps1 -Servidor https://copa-2026.onrender.com

param([string]$Servidor = '')

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

# Lê credenciais do .env
$usuario = 'admin'; $senha = ''
Get-Content (Join-Path $raiz '.env') -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -match '^ADMIN_USERNAME=(.+)') { $usuario = $Matches[1].Trim() }
    if ($_ -match '^ADMIN_PASSWORD=(.+)') { $senha   = $Matches[1].Trim() }
}

if (-not $Servidor) {
    $Servidor = Read-Host 'URL do servidor Render (ex: https://copa-2026.onrender.com)'
}
$Servidor = $Servidor.TrimEnd('/')

Write-Host ""
Write-Host "Conectando em $Servidor ..." -ForegroundColor Cyan

# Login
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$corpoLogin = ConvertTo-Json @{ username = $usuario; password = $senha }
try {
    Invoke-WebRequest "$Servidor/api/auth/login" -Method POST -UseBasicParsing `
        -ContentType 'application/json' -Body $corpoLogin -WebSession $sess | Out-Null
    Write-Host "Login ok como '$usuario'" -ForegroundColor Green
} catch {
    Write-Host "Falha no login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Baixa cada arquivo e salva localmente sem BOM
$destino = Join-Path $raiz 'dados'
New-Item -ItemType Directory -Force $destino | Out-Null

foreach ($arq in 'users.json', 'palpites.json') {
    try {
        $conteudo = (Invoke-WebRequest "$Servidor/api/admin/dados/$arq" `
            -WebSession $sess -UseBasicParsing).Content
        [System.IO.File]::WriteAllText(
            (Join-Path $destino $arq),
            $conteudo,
            (New-Object System.Text.UTF8Encoding $false)
        )
        Write-Host "  dados\$arq salvo." -ForegroundColor Green
    } catch {
        Write-Host "  Aviso: $arq nao encontrado no servidor (pode estar vazio)." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Pronto. Inicie o servidor local (iniciar.bat) para usar os dados baixados." -ForegroundColor Cyan
Write-Host ""
