(() => {
'use strict';
const hostDocument=window.document;
const root=hostDocument.getElementById('orderDashboard');
const document={getElementById:id=>hostDocument.getElementById('lg-'+id),createElement:tag=>hostDocument.createElement(tag),querySelector:selector=>hostDocument.querySelector(selector.replace(/#([a-zA-Z][\w-]*)/g,'#lg-$1')),addEventListener:(...args)=>hostDocument.addEventListener(...args)};
let dadosBrutos = [];

let dadosFiltrados = [];

let graficoStatusInstance = null;

let graficoCategoriaInstance = null;

let graficoEvolucaoValorInstance = null;

let graficoVisitasSemanaInstance = null;

let graficoVisitasDiaInstance = null;

document.addEventListener("DOMContentLoaded", () => {

    const excelFile = document.getElementById("excelFile");

    const btnUpdate = document.getElementById("btnUpdate");

    const btnClear = document.getElementById("btnClear");

    const statusFilter = document.getElementById("statusFilter");

    const categoryFilter = document.getElementById("categoryFilter");

    const serviceFilter = document.getElementById("serviceFilter");

    const projectFilter = document.getElementById("projectFilter");
    const regionFilter = document.getElementById("regionFilter");
    const supplierFilter = document.getElementById("supplierFilter");

    const dtInicio = document.getElementById("dtInicio");

    const dtFim = document.getElementById("dtFim");


    if (excelFile) {

        excelFile.addEventListener(
            "change",
            processarArquivo
        );

    }


    if (btnUpdate) {

        btnUpdate.addEventListener(
            "click",
            processarEAtualizar
        );

    }


    if (btnClear) {

        btnClear.addEventListener(
            "click",
            limparFiltros
        );

    }


    if (statusFilter) {

        statusFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }


    if (categoryFilter) {

        categoryFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }


    if (serviceFilter) {

        serviceFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }


    if (projectFilter) {

        projectFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }

    if (regionFilter) {

        regionFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }

    if (supplierFilter) {

        supplierFilter.addEventListener(
            "change",
            processarEAtualizar
        );

    }


    if (dtInicio) {

        dtInicio.addEventListener(
            "change",
            processarEAtualizar
        );

    }


    if (dtFim) {

        dtFim.addEventListener(
            "change",
            processarEAtualizar
        );

    }

});

function normalizarChave(str) {

    return String(str || "")
        .replace(/^\uFEFF/, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

}

/**
 * PADRONIZA O NOME DO FORNECEDOR PARA FILTROS E INDICADORES.
 * Remove o CNPJ informado entre parênteses no final do nome e
 * normaliza espaços, sem alterar o valor original da base.
 */
function normalizarFornecedor(valor) {
    return String(valor || "")
        .replace(/\s*\(\s*CNPJ\s*[^)]*\)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extrairValorColuna(row, nomesPossiveis) {

    if (!row) return "";

    const chaves = Object.keys(row);


    for (const nome of nomesPossiveis) {

        const nomeAlvo =
            normalizarChave(nome);


        const chaveEncontrada =
            chaves.find(
                k => normalizarChave(k) === nomeAlvo
            );


        if (
            chaveEncontrada &&
            row[chaveEncontrada] !== undefined &&
            row[chaveEncontrada] !== null
        ) {

            return String(
                row[chaveEncontrada]
            )
                .replace(/^["\s]+|["\s]+$/g, "")
                .trim();

        }

    }


    return "";

}

function converterMoedaParaNumero(valor) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return 0;

    }


    if (typeof valor === "number") {

        return valor;

    }


    let valorStr =
        String(valor)
            .trim()
            .replace(/[R$\s]/g, "");


    if (
        valorStr.includes(".") &&
        valorStr.includes(",")
    ) {

        valorStr =
            valorStr
                .replace(/\./g, "")
                .replace(",", ".");

    }

    else if (
        valorStr.includes(",")
    ) {

        valorStr =
            valorStr.replace(",", ".");

    }


    valorStr =
        valorStr.replace(
            /[^0-9.-]/g,
            ""
        );


    const numero =
        parseFloat(valorStr);


    return isNaN(numero)
        ? 0
        : numero;

}

function formatarMoedaBRL(valor) {

    return Number(valor || 0)
        .toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );

}

function parseDataBR(valor) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return null;

    }


    if (valor instanceof Date) {

        if (!isNaN(valor.getTime())) {

            return new Date(
                valor.getFullYear(),
                valor.getMonth(),
                valor.getDate()
            );

        }

    }


    const str =
        String(valor)
            .trim()
            .replace(/^["']+|["']+$/g, "");

    const matchBR =
        str.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})/
        );


    if (matchBR) {

        const dia =
            parseInt(matchBR[1], 10);

        const mes =
            parseInt(matchBR[2], 10) - 1;

        const ano =
            parseInt(matchBR[3], 10);


        const data =
            new Date(
                ano,
                mes,
                dia
            );


        if (
            data.getFullYear() === ano &&
            data.getMonth() === mes &&
            data.getDate() === dia
        ) {

            return data;

        }


        return null;

    }

    const matchISO =
        str.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})/
        );


    if (matchISO) {

        const ano =
            parseInt(matchISO[1], 10);

        const mes =
            parseInt(matchISO[2], 10) - 1;

        const dia =
            parseInt(matchISO[3], 10);


        const data =
            new Date(
                ano,
                mes,
                dia
            );


        if (
            data.getFullYear() === ano &&
            data.getMonth() === mes &&
            data.getDate() === dia
        ) {

            return data;

        }

    }

    if (
        /^[0-9]+(\.[0-9]+)?$/.test(str)
    ) {

        const serial =
            Number(str);


        if (
            serial > 20000 &&
            serial < 100000
        ) {

            const data =
                new Date(
                    Date.UTC(
                        1899,
                        11,
                        30
                    ) +
                    serial *
                    24 *
                    60 *
                    60 *
                    1000
                );


            return new Date(
                data.getUTCFullYear(),
                data.getUTCMonth(),
                data.getUTCDate()
            );

        }

    }


    return null;

}

function identificarTipoItem(row) {

    const descricao =
        extrairValorColuna(
            row,
            ["DESCRICAO"]
        );


    const texto =
        String(descricao || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase();


    if (
        texto.includes("SERVICO")
    ) {

        return "SERVICOS";

    }


    return "PRODUTOS";

}

function escapeHTML(valor) {

    return String(valor || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* ============================================================
 * PARSER CSV
 *
 * Suporta:
 * - ;
 * - ,
 * - campos entre aspas
 * - aspas duplas dentro de campos
 *
 * ============================================================ */

function converterCSVParaArray(texto) {

    const linhas =
        texto.split(/\r\n|\n/);


    if (
        linhas.length === 0
    ) {

        return [];

    }


    /*
     * Detectar delimitador
     */

    const primeiraLinha =
        linhas[0];


    const qtdPontoVirgula =
        (
            primeiraLinha.match(
                /;/g
            ) || []
        ).length;


    const qtdVirgula =
        (
            primeiraLinha.match(
                /,/g
            ) || []
        ).length;


    const delimitador =
        qtdPontoVirgula >= qtdVirgula
            ? ";"
            : ",";


    /*
     * Parser respeitando aspas
     */

    const separarLinha =
        function (linha) {

            const resultado = [];

            let atual = "";

            let dentroAspas = false;


            for (
                let i = 0;
                i < linha.length;
                i++
            ) {

                const caractere =
                    linha[i];


                if (
                    caractere === '"'
                ) {

                    /*
                     * Aspas duplas dentro
                     * de campo:
                     *
                     * ""
                     */

                    if (
                        dentroAspas &&
                        linha[i + 1] === '"'
                    ) {

                        atual += '"';

                        i++;

                        continue;

                    }


                    dentroAspas =
                        !dentroAspas;

                    continue;

                }


                if (
                    caractere === delimitador &&
                    !dentroAspas
                ) {

                    resultado.push(
                        atual
                    );

                    atual = "";

                }


                else {

                    atual +=
                        caractere;

                }

            }


            resultado.push(
                atual
            );


            return resultado;

        };


    const headers =
        separarLinha(
            linhas[0]
        ).map(
            h =>
                String(h || "")
                    .replace(/^\uFEFF/, "")
                    .trim()
        );


    const resultado = [];


    for (
        let i = 1;
        i < linhas.length;
        i++
    ) {

        const linha =
            linhas[i];


        if (
            !linha ||
            !linha.trim()
        ) {

            continue;

        }


        const valores =
            separarLinha(
                linha
            );


        const row = {};


        headers.forEach(
            (header, index) => {

                row[header] =
                    valores[index] !== undefined
                        ? valores[index].trim()
                        : "";

            }
        );


        resultado.push(
            row
        );

    }


    return resultado;

}



/* ============================================================
 * LOCALIZAÇÃO DO FORNECEDOR
 *
 * A base possui a cidade do fornecedor, mas não traz UF.
 * O mapa abaixo relaciona as cidades presentes na base à UF
 * e cria uma classificação operacional:
 * - São Paulo Capital
 * - Região Metropolitana de São Paulo
 * - Interior de São Paulo
 * - Demais estados
 * ============================================================ */

const MUNICIPIOS_FORNECEDOR = {
    "AGUAI": ["Aguai", "SP"],
    "AGUAI/SP": ["Aguai", "SP"],
    "AMERICANA": ["Americana", "SP"],
    "AMPARO": ["Amparo", "SP"],
    "ARACOIABA DA SERRA": ["Araçoiaba da Serra", "SP"],
    "ARARAQUARA": ["Araraquara", "SP"],
    "ARARAS": ["Araras", "SP"],
    "ARACATUBA": ["Araçatuba", "SP"],
    "ARTUR NOGUEIRA": ["Artur Nogueira", "SP"],
    "ARUJA": ["Arujá", "SP"],
    "ATIBAIA": ["Atibaia", "SP"],
    "BARUERI": ["Barueri", "SP"],
    "BAURU": ["Bauru", "SP"],
    "BELO HORIZONTE": ["Belo Horizonte", "MG"],
    "BLUMENAU": ["Blumenau", "SC"],
    "BOITUVA": ["Boituva", "SP"],
    "BOTUCATU": ["Botucatu", "SP"],
    "CACAPAVA": ["Caçapava", "SP"],
    "CACHOEIRINHA": ["Cachoeirinha", "RS"],
    "CAIEIRAS": ["Caieiras", "SP"],
    "CAJAMAR": ["Cajamar", "SP"],
    "CAJAMR": ["Cajamar", "SP"],
    "CAMACARI": ["Camaçari", "BA"],
    "CAMANDUCAIA": ["Camanducaia", "MG"],
    "CAMPINAS": ["Campinas", "SP"],
    "CAMPO LARGO": ["Campo Largo", "PR"],
    "CARAPICUIBA": ["Carapicuíba", "SP"],
    "CATANDUVA": ["Catanduva", "SP"],
    "CATAS ALTAS": ["Catas Altas", "MG"],
    "COLOMBO": ["Colombo", "PR"],
    "CONCORDIA": ["Concórdia", "SC"],
    "COTIA": ["Cotia", "SP"],
    "CRICIUMA": ["Criciúma", "SC"],
    "CURITIBA": ["Curitiba", "PR"],
    "DIADEMA": ["Diadema", "SP"],
    "DUQUE DE CAXIAS": ["Duque de Caxias", "RJ"],
    "ELIAS FAUSTO": ["Elias Fausto", "SP"],
    "EMBU DAS ARTES": ["Embu das Artes", "SP"],
    "FAZENDA RIO GRANDE": ["Fazenda Rio Grande", "PR"],
    "FERRAZ DE VASCONCELOS": ["Ferraz de Vasconcelos", "SP"],
    "FLORIANOPOLIS": ["Florianópolis", "SC"],
    "FRANCA": ["Franca", "SP"],
    "FRANCO DA ROCHA": ["Franco da Rocha", "SP"],
    "GARCA": ["Garça", "SP"],
    "GARUVA": ["Garuva", "SC"],
    "GASPAR": ["Gaspar", "SC"],
    "GOIANA": ["Goiana", "PE"],
    "GUARAREMA": ["Guararema", "SP"],
    "GUARULHOS": ["Guarulhos", "SP"],
    "GUAXUPE": ["Guaxupé", "MG"],
    "HORTOLANDIA": ["Hortolândia", "SP"],
    "IBATE": ["Ibaté", "SP"],
    "ICARA": ["Içara", "SC"],
    "IJUI": ["Ijuí", "RS"],
    "INDAIATUBA": ["Indaiatuba", "SP"],
    "ITAJAI": ["Itajaí", "SC"],
    "ITAJUBA": ["Itajubá", "MG"],
    "ITAPECERICA DA SERRA": ["Itapecerica da Serra", "SP"],
    "ITAPECERICA DA SERRS": ["Itapecerica da Serra", "SP"],
    "ITAPEVA": ["Itapeva", "SP"],
    "ITAPEVI": ["Itapevi", "SP"],
    "ITAPIRA": ["Itapira", "SP"],
    "ITAQUAQUECETUBA": ["Itaquaquecetuba", "SP"],
    "ITATIBA": ["Itatiba", "SP"],
    "ITAU DE MINAS": ["Itaú de Minas", "MG"],
    "ITU": ["Itu", "SP"],
    "ITUPEVA": ["Itupeva", "SP"],
    "JABOTICABAL": ["Jaboticabal", "SP"],
    "JAGUARIUNA": ["Jaguariúna", "SP"],
    "JANDIRA": ["Jandira", "SP"],
    "JARAGUA DO SUL": ["Jaraguá do Sul", "SC"],
    "JOINVILLE": ["Joinville", "SC"],
    "JOINVILE": ["Joinville", "SC"],
    "JOINVILLI": ["Joinville", "SC"],
    "JUNDIAI": ["Jundiaí", "SP"],
    "LAGES": ["Lages", "SC"],
    "LAJEADO": ["Lajeado", "RS"],
    "LENCOIS PAULISTA": ["Lençóis Paulista", "SP"],
    "LIMEIRA": ["Limeira", "SP"],
    "LOUVEIRA": ["Louveira", "SP"],
    "MAIRIPORA": ["Mairiporã", "SP"],
    "MARILIA": ["Marília", "SP"],
    "MARINGA": ["Maringá", "PR"],
    "MAUA": ["Mauá", "SP"],
    "MOCOCA": ["Mococa", "SP"],
    "MOGI DAS CRUZES": ["Mogi das Cruzes", "SP"],
    "MOJI DAS CRUZES": ["Mogi das Cruzes", "SP"],
    "MOGI GUACU": ["Mogi Guaçu", "SP"],
    "MOGI GUAXU": ["Mogi Guaçu", "SP"],
    "MOGI GUAÇU": ["Mogi Guaçu", "SP"],
    "MOGI MIRIM": ["Mogi Mirim", "SP"],
    "MOJI-MIRIM": ["Mogi Mirim", "SP"],
    "MONTE ALTO": ["Monte Alto", "SP"],
    "MONTES CLAROS": ["Montes Claros", "MG"],
    "NOVA IGUACU": ["Nova Iguaçu", "RJ"],
    "NOVA ODESSA": ["Nova Odessa", "SP"],
    "NOVO HAMBURGO": ["Novo Hamburgo", "RS"],
    "OLIMPIA": ["Olímpia", "SP"],
    "OSASCO": ["Osasco", "SP"],
    "PARANA": ["Paraná", "PR"],
    "PAULINIA": ["Paulínia", "SP"],
    "PELOTAS": ["Pelotas", "RS"],
    "PINHAIS": ["Pinhais", "PR"],
    "PIRACAIA": ["Piracaia", "SP"],
    "PIRACICABA": ["Piracicaba", "SP"],
    "POA": ["Poá", "SP"],
    "POCOS DE CALDAS": ["Poços de Caldas", "MG"],
    "PORTO ALEGRE": ["Porto Alegre", "RS"],
    "POUSO ALEGRE": ["Pouso Alegre", "MG"],
    "PRESIDENTE PRUDENTE": ["Presidente Prudente", "SP"],
    "RIBEIRAO DAS NEVES": ["Ribeirão das Neves", "MG"],
    "RIBEIRAO PIRES": ["Ribeirão Pires", "SP"],
    "RIBEIRAO PRETO": ["Ribeirão Preto", "SP"],
    "RIO CLARO": ["Rio Claro", "SP"],
    "RIO DE JANEIRO": ["Rio de Janeiro", "RJ"],
    "RIO DO SUL": ["Rio do Sul", "SC"],
    "SALTINHO": ["Saltinho", "SP"],
    "SANTA BARBARA D OESTE": ["Santa Bárbara d'Oeste", "SP"],
    "SANTA BARBARA D' OESTE": ["Santa Bárbara d'Oeste", "SP"],
    "SANTA BARBARA D'OESTE": ["Santa Bárbara d'Oeste", "SP"],
    "SANTA BARBARA DOESTE": ["Santa Bárbara d'Oeste", "SP"],
    "SANTA CATARINA": ["Santa Catarina", "SC"],
    "SANTA ISABEL": ["Santa Isabel", "SP"],
    "SANTA RITA DO SAPUCAI": ["Santa Rita do Sapucaí", "MG"],
    "SANTANA DE PARNAIBA": ["Santana de Parnaíba", "SP"],
    "SANTO ANDRE": ["Santo André", "SP"],
    "SANTO ANTONIO DE POSSE": ["Santo Antônio de Posse", "SP"],
    "SANTOS": ["Santos", "SP"],
    "SAO BERNADO DO CAMPO": ["São Bernardo do Campo", "SP"],
    "SAO BERNARDO DO CAMPO": ["São Bernardo do Campo", "SP"],
    "SAO CAETANO DO SUL": ["São Caetano do Sul", "SP"],
    "SAO CARLOS": ["São Carlos", "SP"],
    "SAO JOAO DA BOA VISTA": ["São João da Boa Vista", "SP"],
    "SAO JOSE": ["São José", "SC"],
    "SAO JOSE DO RIO PRETO": ["São José do Rio Preto", "SP"],
    "SAO JOSE DOS CAMPOS": ["São José dos Campos", "SP"],
    "SAO JOSE DOS PINHAIS": ["São José dos Pinhais", "PR"],
    "SAO PAULO": ["São Paulo", "SP"],
    "SAO ROQUE": ["São Roque", "SP"],
    "SAPUCAIA DO SUL": ["Sapucaia do Sul", "RS"],
    "SERRA": ["Serra", "ES"],
    "SERRA/ES": ["Serra", "ES"],
    "SERRANA": ["Serrana", "SP"],
    "SOROCABA": ["Sorocaba", "SP"],
    "SUMARE": ["Sumaré", "SP"],
    "SUZANO": ["Suzano", "SP"],
    "TABOAO DA SERRA": ["Taboão da Serra", "SP"],
    "TATUAPE": ["Tatuapé (São Paulo)", "SP"],
    "TAUBATE": ["Taubaté", "SP"],
    "TIJUCAS": ["Tijucas", "SC"],
    "TIMBO": ["Timbó", "SC"],
    "TOLEDO": ["Toledo", "PR"],
    "UBIRATA": ["Ubiratã", "PR"],
    "VALINHOS": ["Valinhos", "SP"],
    "VARGEM GRANDE PAULISTA": ["Vargem Grande Paulista", "SP"],
    "VARGINHA": ["Varginha", "MG"],
    "VARZEA PAULISTA": ["Várzea Paulista", "SP"],
    "VINHEDO": ["Vinhedo", "SP"],
    "0": ["Não informado", ""],
    "EX": ["Não informado", ""]
};

function normalizarCidade(cidade) {
    return String(cidade || "")
        .replace(/^["']+|["']+$/g, "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ");
}

function obterLocalFornecedor(row) {
    const cidadeOriginal =
        extrairValorColuna(row, ["CIDADE"]) || "";

    const chave = normalizarCidade(cidadeOriginal);
    const cadastro = MUNICIPIOS_FORNECEDOR[chave];

    if (!cadastro) {
        return {
            cidade: cidadeOriginal || "Não informado",
            uf: "",
            cidadeUf: cidadeOriginal || "Não informado",
            regiao: "Não identificado"
        };
    }

    const cidade = cadastro[0];
    const uf = cadastro[1];

    let regiao = "Fora de São Paulo";

    if (uf === "SP") {
        if (
            chave === "SAO PAULO" ||
            chave === "TATUAPE"
        ) {
            regiao = "São Paulo Capital";
        } else if (
            [
                "ARUJA", "BARUERI", "CAIEIRAS", "CAJAMAR", "CAJAMR",
                "CARAPICUIBA", "COTIA", "DIADEMA", "EMBU DAS ARTES",
                "FERRAZ DE VASCONCELOS", "FRANCO DA ROCHA", "GUARAREMA",
                "GUARULHOS", "ITAPECERICA DA SERRA", "ITAPECERICA DA SERRS",
                "ITAPEVI", "ITAQUAQUECETUBA", "JANDIRA", "MAIRIPORA",
                "MAUA", "MOGI DAS CRUZES", "MOJI DAS CRUZES", "OSASCO",
                "POA", "RIBEIRAO PIRES", "SANTA ISABEL",
                "SANTANA DE PARNAIBA", "SANTO ANDRE", "SAO BERNADO DO CAMPO",
                "SAO BERNARDO DO CAMPO", "SAO CAETANO DO SUL", "SUZANO",
                "TABOAO DA SERRA", "VARGEM GRANDE PAULISTA"
            ].includes(chave)
        ) {
            regiao = "Região Metropolitana de São Paulo";
        } else {
            regiao = "Interior de São Paulo";
        }
    } else if (uf === "PR") {
        regiao = "Paraná";
    } else if (uf === "SC") {
        regiao = "Santa Catarina";
    } else if (uf === "MG") {
        regiao = "Minas Gerais";
    } else if (uf === "RJ") {
        regiao = "Rio de Janeiro";
    } else if (uf === "RS") {
        regiao = "Rio Grande do Sul";
    } else if (uf === "ES") {
        regiao = "Espírito Santo";
    } else if (uf === "BA") {
        regiao = "Bahia";
    } else if (uf === "GO") {
        regiao = "Goiás";
    } else if (uf === "PE") {
        regiao = "Pernambuco";
    }

    return {
        cidade,
        uf,
        cidadeUf: uf ? `${cidade}/${uf}` : cidade,
        regiao
    };
}

/* ============================================================
 * POPULAR FILTROS
 * ============================================================ */

function popularFiltrosSelect(dados) {

    const statusFilter =
        document.getElementById(
            "statusFilter"
        );


    const categoryFilter =
        document.getElementById(
            "categoryFilter"
        );


    const projectFilter =
        document.getElementById(
            "projectFilter"
        );


    const regionFilter =
        document.getElementById(
            "regionFilter"
        );


    const supplierFilter =
        document.getElementById(
            "supplierFilter"
        );


    const statusSet =
        new Set();


    const catSet =
        new Set();


    const projSet =
        new Set();


    const regionSet =
        new Set();

    const supplierMap =
        new Map();


    dados.forEach(
        row => {

            const status =
                extrairValorColuna(
                    row,
                    [
                        "STATUS",
                        "SITUACAO",
                        "STATUS DO PEDIDO"
                    ]
                );


            const categoria =
                extrairValorColuna(
                    row,
                    [
                        "TIPO"
                    ]
                );


            const projeto =
                extrairValorColuna(
                    row,
                    [
                        "PROJETO"
                    ]
                );

            const fornecedor =
                extrairValorColuna(
                    row,
                    [
                        "NOME",
                        "NOME_",
                        "FORNECEDOR",
                        "FORNECEDOR_"
                    ]
                );


            if (status) {

                statusSet.add(
                    status
                );

            }


            if (categoria) {

                catSet.add(
                    categoria
                );

            }


            if (projeto) {

                projSet.add(
                    projeto
                );

            }

            if (fornecedor) {

                const fornecedorPadronizado =
                    normalizarFornecedor(
                        fornecedor
                    );

                if (fornecedorPadronizado) {
                    const chaveFornecedor =
                        normalizarChave(
                            fornecedorPadronizado
                        );

                    if (
                        chaveFornecedor &&
                        !supplierMap.has(
                            chaveFornecedor
                        )
                    ) {
                        supplierMap.set(
                            chaveFornecedor,
                            fornecedorPadronizado
                        );
                    }
                }

            }


            const local =
                obterLocalFornecedor(row);

            if (local.regiao) {

                regionSet.add(
                    local.regiao
                );

            }

        }
    );


    /*
     * STATUS
     */

    if (statusFilter) {

        statusFilter.innerHTML =
            `<option value="TODOS">
                Todos os Status
            </option>`;


        Array.from(statusSet)
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        undefined,
                        {
                            numeric: true
                        }
                    )
            )
            .forEach(
                status => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        status;

                    option.textContent =
                        status;


                    statusFilter.appendChild(
                        option
                    );

                }
            );

    }


    /*
     * CATEGORIA
     */

    if (categoryFilter) {

        categoryFilter.innerHTML =
            `<option value="TODAS">
                Todas as Categorias
            </option>`;


        Array.from(catSet)
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        undefined,
                        {
                            numeric: true
                        }
                    )
            )
            .forEach(
                categoria => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        categoria;

                    option.textContent =
                        categoria;


                    categoryFilter.appendChild(
                        option
                    );

                }
            );

    }


    /*
     * PROJETO
     */

    if (projectFilter) {

        projectFilter.innerHTML =
            `<option value="TODOS">
                Todos os Projetos
            </option>`;


        Array.from(projSet)
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        undefined,
                        {
                            numeric: true
                        }
                    )
            )
            .forEach(
                projeto => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        projeto;

                    option.textContent =
                        projeto;


                    projectFilter.appendChild(
                        option
                    );

                }
            );

    }


    /*
     * REGIÃO DO FORNECEDOR
     */

    if (regionFilter) {

        regionFilter.innerHTML =
            `<option value="TODAS">
                Todas as Regiões
            </option>`;

        Array.from(regionSet)
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        "pt-BR",
                        {
                            numeric: true
                        }
                    )
            )
            .forEach(
                regiao => {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        regiao;

                    option.textContent =
                        regiao;

                    regionFilter.appendChild(
                        option
                    );

                }
            );

    }

    /*
     * FORNECEDOR (NOME)
     */
    if (supplierFilter) {

        supplierFilter.innerHTML =
            `<option value="TODOS">
                Todos os Fornecedores
            </option>`;

        Array.from(supplierMap.values())
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        "pt-BR",
                        {
                            numeric: true
                        }
                    )
            )
            .forEach(
                fornecedor => {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        fornecedor;

                    option.textContent =
                        fornecedor;

                    supplierFilter.appendChild(
                        option
                    );

                }
            );

    }

}


/* ============================================================
* PROCESSAR FILTROS
* ============================================================ */

function atualizarStatusFiltro(
    quantidade
) {

    const statusDetalhes =
        document.getElementById(
            "statusDetalhes"
        );


    if (!statusDetalhes) {

        return;

    }


    statusDetalhes.innerText =
        `${quantidade.toLocaleString(
            "pt-BR"
        )} linhas após aplicação dos filtros.`;

}


/* ============================================================
 * KPIs
 * ============================================================ */

function atualizarKPIs(dados) {

    const pedidosUnicos =
        new Set();


    let valorTotal =
        0;


    let somaLeadTime =
        0;


    let totalLeadTime =
        0;


    dados.forEach(
        row => {

            /*
             * PEDIDO
             */

            const pedido =
                extrairValorColuna(
                    row,
                    [
                        "PEDIDO_",
                        "PEDIDO",
                        "SOLICITACAO"
                    ]
                );


            if (pedido) {

                pedidosUnicos.add(
                    pedido
                );

            }


            /*
             * VALOR
             */

            const valor =
                converterMoedaParaNumero(
                    extrairValorColuna(
                        row,
                        [
                            "VLR.TOTAL",
                            "VLRTOTAL",
                            "VALOR TOTAL",
                            "VALOR"
                        ]
                    )
                );


            valorTotal +=
                valor;


            /*
             * LEAD TIME
             */

            const status =
                extrairValorColuna(
                    row,
                    [
                        "STATUS",
                        "SITUACAO"
                    ]
                )
                    .toUpperCase()
                    .trim();


            if (
                status === "FINALIZADO"
            ) {

                const emissao =
                    parseDataBR(
                        extrairValorColuna(
                            row,
                            [
                                "EMISSAO"
                            ]
                        )
                    );


                const agendamento =
                    parseDataBR(
                        extrairValorColuna(
                            row,
                            [
                                "AGENDAMENTO"
                            ]
                        )
                    );


                if (
                    emissao &&
                    agendamento &&
                    agendamento >= emissao
                ) {

                    const diferenca =
                        agendamento -
                        emissao;


                    const dias =
                        Math.ceil(
                            diferenca /
                            (
                                1000 *
                                60 *
                                60 *
                                24
                            )
                        );


                    somaLeadTime +=
                        dias;


                    totalLeadTime++;

                }

            }

        }
    );


    const totalPedidos =
        pedidosUnicos.size;
    const leadTimeMedio =
        totalLeadTime > 0
            ? (
                somaLeadTime /
                totalLeadTime
            ).toFixed(1)
            : "0";


    /*
     * Atualizar tela
     */

    const kpiPedidos =
        document.getElementById(
            "kpiPedidos"
        );


    const kpiLinhas =
        document.getElementById(
            "kpiLinhas"
        );


    const kpiLeadTime =
        document.getElementById(
            "kpiLeadTime"
        );


    const kpiValorTotal =
        document.getElementById(
            "kpiValorTotal"
        );
    if (kpiPedidos) {

        kpiPedidos.innerText =
            totalPedidos.toLocaleString(
                "pt-BR"
            );

    }


    if (kpiLinhas) {

        kpiLinhas.innerText =
            dados.length.toLocaleString(
                "pt-BR"
            );

    }


    if (kpiLeadTime) {

        kpiLeadTime.innerText =
            `${leadTimeMedio} dias`;

    }


    if (kpiValorTotal) {

        kpiValorTotal.innerText =
            formatarMoedaBRL(
                valorTotal
            );

    }
}


/* ============================================================
 * GRÁFICOS
 * ============================================================ */

function atualizarGraficos(dados) {

    const ctxStatus =
        document
            .getElementById(
                "chartStatus"
            )
            ?.getContext("2d");


    const ctxCategoria =
        document
            .getElementById(
                "chartCategoria"
            )
            ?.getContext("2d");


    const statusCounts = {};

    const categoriaCounts = {};


    dados.forEach(
        row => {

            const status =
                extrairValorColuna(
                    row,
                    [
                        "STATUS",
                        "SITUACAO"
                    ]
                ) ||
                "Sem Status";


            const categoria =
                extrairValorColuna(
                    row,
                    [
                        "TIPO"
                    ]
                ) ||
                "Outros";


            statusCounts[status] =
                (
                    statusCounts[status] ||
                    0
                ) + 1;


            categoriaCounts[categoria] =
                (
                    categoriaCounts[categoria] ||
                    0
                ) + 1;

        }
    );


    /*
     * GRÁFICO STATUS
     */

    if (ctxStatus) {

        if (
            graficoStatusInstance
        ) {

            graficoStatusInstance.destroy();

        }


        graficoStatusInstance =
            new Chart(
                ctxStatus,
                {

                    type: "bar",

                    data: {

                        labels:
                            Object.keys(
                                statusCounts
                            ),

                        datasets: [

                            {

                                label:
                                    "Itens",

                                data:
                                    Object.values(
                                        statusCounts
                                    ),

                                backgroundColor:
                                    "#2563eb"

                            }

                        ]

                    },


                    options: {

                        responsive: true,

                        maintainAspectRatio:
                            false,

                        plugins: {

                            legend: {

                                display:
                                    true

                            }

                        }

                    }

                }
            );

    }


    /*
     * GRÁFICO CATEGORIA
     */

    if (ctxCategoria) {

        if (
            graficoCategoriaInstance
        ) {

            graficoCategoriaInstance.destroy();

        }


        graficoCategoriaInstance =
            new Chart(
                ctxCategoria,
                {

                    type:
                        "doughnut",

                    data: {

                        labels:
                            Object.keys(
                                categoriaCounts
                            ),

                        datasets: [

                            {

                                data:
                                    Object.values(
                                        categoriaCounts
                                    ),

                                backgroundColor: [
                                    "#16a34a",
                                    "#2563eb",
                                    "#eab308",
                                    "#dc2626",
                                    "#9333ea",
                                    "#0891b2",
                                    "#ea580c"
                                ]

                            }

                        ]

                    },


                    options: {

                        responsive: true,

                        maintainAspectRatio:
                            false,

                        plugins: {

                            legend: {

                                position:
                                    "top"

                            }

                        }

                    }

                }
            );

    }

}


/* ============================================================
 * NOVO GRÁFICO
 *
 * EVOLUÇÃO DO VALOR FINALIZADO POR SEMANA
 *
 * REGRA:
 *
 * SOMENTE STATUS = FINALIZADO
 *
 * Semana 1 = 01 até 07
 * Semana 2 = 08 até 14
 * Semana 3 = 15 até 21
 * Semana 4 = 22 até 28
 * Semana 5 = 29 até fim do mês
 *
 * DATA UTILIZADA:
 *
 * AGENDAMENTO
 *
 * VALOR:
 *
 * VLR.TOTAL
 *
 * ============================================================ */

/* ============================================================
 * CONTROLE DE VISITAS E ALTERAÇÕES DE PONTO
 * ============================================================ */

function obterFornecedor(row) {

    const fornecedor =
        extrairValorColuna(
            row,
            [
                "NOME",
                "NOME_",
                "FORNECEDOR",
                "FORNECEDOR_"
            ]
        );

    return normalizarFornecedor(
        fornecedor || "Sem Fornecedor"
    );

}

function obterDataAgendamento(row) {

    return parseDataBR(
        extrairValorColuna(
            row,
            [
                "AGENDAMENTO"
            ]
        )
    );

}

function obterChavePedidoBase(pedido) {

    const texto =
        String(pedido || "").trim();

    const match =
        texto.match(/^(.+?)(?:\.\d+)+$/);

    return match
        ? match[1]
        : texto;

}

function obterNumeroAlteracao(pedido) {

    const texto =
        String(pedido || "").trim();

    const match =
        texto.match(/\.(\d+)$/);

    if (!match) return 0;

    return parseInt(
        match[1],
        10
    ) || 0;

}

function calcularAlteracoesPorFornecedor(dados) {

    const pedidos =
        new Map();

    dados.forEach(row => {

        const pedido =
            extrairValorColuna(
                row,
                [
                    "PEDIDO_",
                    "PEDIDO"
                ]
            );

        if (!pedido) return;

        const fornecedor =
            obterFornecedor(row);

        const base =
            obterChavePedidoBase(
                pedido
            );

        const alteracao =
            obterNumeroAlteracao(
                pedido
            );

        const chave =
            `${fornecedor}||${base}`;

        const atual =
            pedidos.get(chave) || 0;

        if (alteracao > atual) {

            pedidos.set(
                chave,
                alteracao
            );

        }

    });

    const resultado = {};

    pedidos.forEach(
        (alteracoes, chave) => {

            if (!alteracoes) return;

            const fornecedor =
                chave.split("||")[0];

            resultado[fornecedor] =
                (
                    resultado[fornecedor] || 0
                ) + alteracoes;

        }
    );

    return resultado;

}

function obterVisitasUnicas(dados) {

    const visitas =
        new Set();

    dados.forEach(row => {

        const fornecedor =
            obterFornecedor(row);

        const data =
            obterDataAgendamento(
                row
            );

        if (!data) return;

        const chave =
            `${fornecedor}||${data.getFullYear()}-${String(
                data.getMonth() + 1
            ).padStart(2, "0")}-${String(
                data.getDate()
            ).padStart(2, "0")}`;

        visitas.add(chave);

    });

    return visitas;

}

function atualizarGraficoVisitasDia(dados) {

    const canvas =
        document.getElementById(
            "chartVisitasDia"
        );

    if (!canvas) return;

    if (graficoVisitasDiaInstance) {

        graficoVisitasDiaInstance.destroy();

        graficoVisitasDiaInstance = null;

    }

    const visitas =
        obterVisitasUnicas(dados);

    const ordemDias = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado"
    ];

    const contagem =
        Array(7).fill(0);

    visitas.forEach(chave => {

        const dataPartes =
            chave.split("||")[1]
                .split("-");

        const data =
            new Date(
                Number(dataPartes[0]),
                Number(dataPartes[1]) - 1,
                Number(dataPartes[2])
            );

        contagem[
            data.getDay()
        ]++;

    });

    graficoVisitasDiaInstance =
        new Chart(
            canvas.getContext("2d"),
            {

                type:
                    "bar",

                data: {

                    labels:
                        ordemDias,

                    datasets: [
                        {

                            label:
                                "Visitas únicas",

                            data:
                                contagem,

                            borderWidth:
                                1

                        }
                    ]

                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    scales: {

                        y: {

                            beginAtZero:
                                true,

                            ticks: {
                                precision: 0
                            }

                        }

                    },

                    plugins: {

                        legend: {
                            display: false
                        }

                    }

                }

            }
        );

}

function atualizarControleAlteracoes(dados) {

    const alteracoes =
        calcularAlteracoesPorFornecedor(
            dados
        );

    const total =
        Object.values(
            alteracoes
        ).reduce(
            (s, v) => s + v,
            0
        );

    const kpi =
        document.getElementById(
            "kpiAlteracoes"
        );

    if (kpi) {

        kpi.innerText =
            total.toLocaleString(
                "pt-BR"
            );

    }

    const tabela =
        document.getElementById(
            "tabelaAlteracoes"
        );

    if (!tabela) return;

    const ranking =
        Object.entries(
            alteracoes
        )
            .sort(
                (a, b) => b[1] - a[1]
            ).slice(0,5);

    tabela.innerHTML =
        ranking.length
            ? ranking
                .map(
                    ([fornecedor, quantidade]) =>
                        `<tr>
                            <td>${escapeHTML(fornecedor)}</td>
                            <td style="text-align:right;"><strong>${quantidade}</strong></td>
                        </tr>`
                )
                .join("")
            : `<tr>
                    <td colspan="2" style="text-align:center;color:var(--text-muted);">
                        Nenhuma alteração de ponto identificada.
                    </td>
               </tr>`;

}


/* ============================================================
 * EVOLUÇÃO DO VALOR FINALIZADO POR SEMANA
 * ============================================================ */

function formatarMoedaCompacta(
    valor
) {

    const numero =
        Number(valor || 0);


    if (
        Math.abs(numero) >= 1000000
    ) {

        return (
            "R$ " +
            (
                numero / 1000000
            ).toFixed(1) +
            " mi"
        );

    }


    if (
        Math.abs(numero) >= 1000
    ) {

        return (
            "R$ " +
            (
                numero / 1000
            ).toFixed(0) +
            " mil"
        );

    }


    return formatarMoedaBRL(
        numero
    );

}


/* ============================================================
 * TABELA
 * ============================================================ */

function atualizarTabela(
    dados
) {

    const tbody =
        document.querySelector(
            "#tabelaAgenda tbody"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = "";


    if (
        dados.length === 0
    ) {

        tbody.innerHTML = `

            <tr>

                <td
                    colspan="10"
                    style="
                        text-align: center;
                        color: var(--text-muted);
                    ">

                    Nenhum registro encontrado.

                </td>

            </tr>

        `;


        return;

    }


    /*
     * Limite de 100 linhas
     */

    const registros =
        dados.slice(
            0,
            100
        );


    registros.forEach(
        row => {

            const tr =
                document.createElement(
                    "tr"
                );


            const numPedido =
                extrairValorColuna(
                    row,
                    [
                        "PEDIDO_",
                        "PEDIDO"
                    ]
                );


            const item =
                extrairValorColuna(
                    row,
                    [
                        "ITEM_",
                        "ITEM"
                    ]
                );


            const fornecedor =
                extrairValorColuna(
                    row,
                    [
                        "NOME_",
                        "NOME",
                        "FORNECEDOR",
                        "FORNECEDOR_"
                    ]
                ) ||
                "-";


            const local =
                obterLocalFornecedor(row);

            const cidadeUf =
                local.cidadeUf ||
                "-";

            const regiao =
                local.regiao ||
                "-";


            const projeto =
                extrairValorColuna(
                    row,
                    [
                        "PROJETO"
                    ]
                ) ||
                "-";


            const dtEmissao =
                extrairValorColuna(
                    row,
                    [
                        "EMISSAO"
                    ]
                ) ||
                "-";


            const dtAgendamento =
                extrairValorColuna(
                    row,
                    [
                        "AGENDAMENTO"
                    ]
                ) ||
                "-";


            const valor =
                formatarMoedaBRL(
                    converterMoedaParaNumero(
                        extrairValorColuna(
                            row,
                            [
                                "VLR.TOTAL",
                                "VLRTOTAL",
                                "VALOR TOTAL"
                            ]
                        )
                    )
                );


            const status =
                extrairValorColuna(
                    row,
                    [
                        "STATUS",
                        "SITUACAO"
                    ]
                );


            /*
             * Lead Time
             */

            let leadTime =
                "-";


            if (
                status
                    .toUpperCase()
                    .trim() ===
                "FINALIZADO"
            ) {

                const emissao =
                    parseDataBR(
                        dtEmissao
                    );


                const agendamento =
                    parseDataBR(
                        dtAgendamento
                    );


                if (
                    emissao &&
                    agendamento &&
                    agendamento >= emissao
                ) {

                    const diferenca =
                        agendamento -
                        emissao;


                    const dias =
                        Math.ceil(
                            diferenca /
                            (
                                1000 *
                                60 *
                                60 *
                                24
                            )
                        );


                    leadTime =
                        `${dias} dias`;

                }

            }


            /*
             * Classe do badge
             */

            const classeStatus =
                normalizarChave(
                    status
                );


            tr.innerHTML = `

                <td>
                    <strong>
                        #${escapeHTML(
                numPedido
            )}
                    </strong>

                    (${escapeHTML(
                item
            )})
                </td>


                <td>
                    ${escapeHTML(
                fornecedor
            )}
                </td>


                <td>
                    ${escapeHTML(
                cidadeUf
            )}
                </td>


                <td>
                    ${escapeHTML(
                regiao
            )}
                </td>


                <td>
                    ${escapeHTML(
                projeto
            )}
                </td>


                <td>
                    ${escapeHTML(
                dtEmissao
            )}
                </td>


                <td>
                    ${escapeHTML(
                dtAgendamento
            )}
                </td>


                <td>

                    <span
                        class="badge badge-lt">

                        ${leadTime}

                    </span>

                </td>


                <td>
                    ${valor}
                </td>


                <td>

                    <span
                        class="badge badge-${classeStatus || "default"}">

                        ${escapeHTML(
                status
            )}

                    </span>

                </td>

            `;


            tbody.appendChild(
                tr
            );

        }
    );

}


/* ============================================================
 * LIMPAR FILTROS
 * ============================================================ */

function lgDate(row){return parseDataBR(extrairValorColuna(row,['AGENDAMENTO']));}
function lgKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function lgWeek(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=x.getUTCFullYear();return y+'-W'+String(Math.ceil(((x-new Date(Date.UTC(y,0,1)))/86400000+1)/7)).padStart(2,'0');}
function lgWeekLabel(w){const [y,n]=w.split('-W').map(Number);const d=new Date(y,0,4);d.setDate(d.getDate()-((d.getDay()+6)%7)+(n-1)*7);const e=new Date(d);e.setDate(e.getDate()+6);return d.toLocaleDateString('pt-BR')+' a '+e.toLocaleDateString('pt-BR');}
function lgVal(id){return document.getElementById(id)?.value||'';}
function lgSelectWeeks(){const el=document.getElementById('weekFilter'),previous=el.value,month=lgVal('monthFilter');const weeks=[...new Set(dadosBrutos.map(lgDate).filter(d=>d&&(!month||lgKey(d).slice(0,7)===month)).map(lgWeek))].sort();el.innerHTML='<option value="">Todas as semanas</option>';for(const w of weeks){const o=document.createElement('option');o.value=w;o.textContent=lgWeekLabel(w);el.appendChild(o)}el.value=weeks.includes(previous)?previous:'';}
function lgFilterRows(rows,f){return rows.filter(row=>{
 const read=keys=>extrairValorColuna(row,keys);
 if(f.status&&f.status!=='TODOS'&&read(['STATUS','SITUACAO','STATUS DO PEDIDO'])!==f.status)return false;
 if(f.category&&f.category!=='TODAS'&&read(['TIPO'])!==f.category)return false;
 if(f.service&&f.service!=='TODOS'&&identificarTipoItem(row)!==f.service)return false;
 if(f.project&&f.project!=='TODOS'&&read(['PROJETO'])!==f.project)return false;
 if(f.region&&f.region!=='TODAS'&&obterLocalFornecedor(row).regiao!==f.region)return false;
 if(f.supplier&&f.supplier!=='TODOS'&&normalizarChave(normalizarFornecedor(read(['NOME','NOME_','FORNECEDOR','FORNECEDOR_'])))!==normalizarChave(f.supplier))return false;
 const d=lgDate(row);if(f.month||f.week||f.weekday!==''&&f.weekday!==undefined||f.start||f.end){if(!d)return false;const k=lgKey(d);if(f.month&&k.slice(0,7)!==f.month)return false;if(f.week&&lgWeek(d)!==f.week)return false;if(f.weekday!==''&&f.weekday!==undefined&&d.getDay()!==Number(f.weekday))return false;if(f.start&&k<f.start)return false;if(f.end&&k>f.end)return false;}
 return true;
});}
function lgCurrentFilters(){return {status:lgVal('statusFilter'),category:lgVal('categoryFilter'),service:lgVal('serviceFilter'),project:lgVal('projectFilter'),region:lgVal('regionFilter'),supplier:lgVal('supplierFilter'),month:lgVal('monthFilter'),week:lgVal('weekFilter'),weekday:lgVal('weekdayFilter'),start:lgVal('dtInicio'),end:lgVal('dtFim')};}
function processarEAtualizar(){
 const filters=lgCurrentFilters();dadosFiltrados=lgFilterRows(dadosBrutos,filters);
 const renderers=[atualizarKPIs,atualizarGraficos,atualizarGraficoEvolucaoValor,atualizarGraficoVisitasSemana,atualizarGraficoVisitasDia,atualizarControleAlteracoes,atualizarTabela];
 renderers.forEach(render=>render(dadosFiltrados));atualizarStatusFiltro(dadosFiltrados.length);
 const eligible=dadosFiltrados.filter(r=>extrairValorColuna(r,['STATUS','SITUACAO']).toUpperCase()==='FINALIZADO'&&parseDataBR(extrairValorColuna(r,['EMISSAO']))&&lgDate(r)&&lgDate(r)>=parseDataBR(extrairValorColuna(r,['EMISSAO'])));
 if(!eligible.length)document.getElementById('kpiLeadTime').innerText='—';
 const labels={status:'Status',category:'Tipo',service:'Item',project:'Projeto',region:'Região',supplier:'Fornecedor',month:'Mês',week:'Semana',weekday:'Dia',start:'De',end:'Até'};
 const active=Object.entries(filters).filter(([k,v])=>v!==''&&v!=='TODOS'&&v!=='TODAS').map(([k,v])=>labels[k]+': '+(k==='week'?lgWeekLabel(v):k==='weekday'?['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][Number(v)]:v));
 document.getElementById('filterScope').textContent=(active.length?active.join(' · '):'Todos os registros, sem filtros')+' · '+dadosFiltrados.length+' linha(s) no recorte.';
 const noDate=dadosBrutos.filter(r=>!lgDate(r)).length;document.getElementById('dateQuality').textContent=noDate+' linha(s) na base sem agendamento válido: não entram em gráficos temporais e são excluídas ao aplicar filtros de datas. '+eligible.length+' item(ns) com datas válidas no prazo médio.';
}
function atualizarGraficoVisitasSemana(dados){
 if(graficoVisitasSemanaInstance)graficoVisitasSemanaInstance.destroy();
 const map=new Map(),weeks=new Set();for(const visit of obterVisitasUnicas(dados)){const [supplier,date]=visit.split('||'),d=parseDataBR(date);if(!d)continue;const week=lgWeek(d);weeks.add(week);if(!map.has(supplier))map.set(supplier,new Map());map.get(supplier).set(week,(map.get(supplier).get(week)||0)+1);}
 const suppliers=[...map].sort((a,b)=>[...b[1].values()].reduce((s,n)=>s+n,0)-[...a[1].values()].reduce((s,n)=>s+n,0)).slice(0,15).map(x=>x[0]),keys=[...weeks].sort();
 graficoVisitasSemanaInstance=new Chart(document.getElementById('chartVisitasSemana').getContext('2d'),{type:'bar',data:{labels:suppliers,datasets:keys.map((w,i)=>({label:lgWeekLabel(w),data:suppliers.map(s=>map.get(s).get(w)||0),backgroundColor:['#2563eb','#16a34a','#f59e0b','#7c3aed','#0891b2','#e11d48'][i%6]}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
}
function atualizarGraficoEvolucaoValor(dados){
 if(graficoEvolucaoValorInstance)graficoEvolucaoValorInstance.destroy();const totals=new Map();
 for(const r of dados){if(extrairValorColuna(r,['STATUS','SITUACAO']).toUpperCase()!=='FINALIZADO')continue;const d=lgDate(r);if(!d)continue;const w=lgWeek(d);totals.set(w,(totals.get(w)||0)+converterMoedaParaNumero(extrairValorColuna(r,['VLR.TOTAL','VLRTOTAL','VALOR TOTAL','VALOR'])));}
 const keys=[...totals.keys()].sort();graficoEvolucaoValorInstance=new Chart(document.getElementById('chartEvolucaoValor').getContext('2d'),{type:'line',data:{labels:keys.map(lgWeekLabel),datasets:[{label:'Valor dos itens finalizados',data:keys.map(w=>totals.get(w)),borderColor:'#2563eb',backgroundColor:'#2563eb22',fill:true,tension:0,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>formatarMoedaBRL(c.raw)}}},scales:{y:{beginAtZero:true,ticks:{callback:formatarMoedaCompacta}}}}});
}
function limparFiltros(){for(const [id,value] of Object.entries({statusFilter:'TODOS',categoryFilter:'TODAS',serviceFilter:'TODOS',projectFilter:'TODOS',regionFilter:'TODAS',supplierFilter:'TODOS',dtInicio:'',dtFim:'',monthFilter:'',weekFilter:'',weekdayFilter:''}))document.getElementById(id).value=value;lgSelectWeeks();processarEAtualizar();}
async function processarArquivo(event){const file=event.target.files?.[0];if(!file)return;try{const rows=await window.PharmainoxSources.read(file);if(!rows.length)throw Error('Arquivo sem linhas de dados.');await window.PharmainoxSources.setLogRows(rows,file);document.getElementById('statusBanner').style.display='flex';document.getElementById('statusMensagem').textContent='Base de pedidos carregada: '+file.name;document.getElementById('painelErro').style.display='none';}catch(e){document.getElementById('painelErro').style.display='block';document.getElementById('erroDetalhes').textContent=e.message;}}
function lgLoad(rows){
 const saved=lgCurrentFilters();dadosBrutos=rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('_')).map(([k,v])=>[k,v instanceof Date?v.toLocaleDateString('pt-BR'):v])));
 popularFiltrosSelect(dadosBrutos);for(const [field,id]of Object.entries({status:'statusFilter',category:'categoryFilter',service:'serviceFilter',project:'projectFilter',region:'regionFilter',supplier:'supplierFilter'})){const el=document.getElementById(id);if([...el.options].some(o=>o.value===saved[field]))el.value=saved[field];}
 lgSelectWeeks();processarEAtualizar();
 const banner=document.getElementById('statusBanner');banner.style.display='flex';banner.className='status-banner '+(dadosBrutos.length?'':'aviso');
 document.getElementById('statusMensagem').textContent=dadosBrutos.length?'Usando a base de pedidos da Visão Geral':'Aguardando o arquivo de pedidos da Visão Geral';
 document.getElementById('statusDetalhes').textContent=dadosBrutos.length?dadosBrutos.length.toLocaleString('pt-BR')+' linhas carregadas automaticamente. Não é necessário importar novamente.':'Carregue os arquivos principais na Visão Geral. A Logística será atualizada automaticamente.';
}
window.PharmainoxLogistics={load:lgLoad,filterRows:lgFilterRows,weekKey:lgWeek,refresh:processarEAtualizar,resize:()=>[graficoStatusInstance,graficoCategoriaInstance,graficoEvolucaoValorInstance,graficoVisitasSemanaInstance,graficoVisitasDiaInstance].forEach(c=>c?.resize()),getFilteredRows:()=>dadosFiltrados.slice()};
document.addEventListener('DOMContentLoaded',()=>{['weekFilter','weekdayFilter'].forEach(id=>document.getElementById(id).addEventListener('change',processarEAtualizar));document.getElementById('monthFilter').addEventListener('change',()=>{document.getElementById('weekFilter').value='';lgSelectWeeks();processarEAtualizar();});lgLoad(window.PharmainoxSources?.getLogRows()||[]);});

})();
