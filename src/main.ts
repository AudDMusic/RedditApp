import {
    CommentSubmit,
    PostSubmit,
    AppInstall,
    AppUpgrade,
    Metadata,
} from '@devvit/protos';
import {
    Devvit,
    getFromMetadata,
    Header,
    Context,
    Post,
    Comment,
    //UserContext,
    getSetting,
    //ContextActionEvent,
    // CommentSubmissionOptions,
    RedditAPIClient,
} from "@devvit/public-api";
import { URL } from 'whatwg-url';
Devvit.use(Devvit.Types.HTTP);
const reddit = new RedditAPIClient();

const Config: any = {
    Triggers: [
        "whats the song", "whats this song",
        "what song is playing", "what song is this", "what the song is playing", "what the song is this",
        "what song this is", "what song is it", "whats that song", "what song is that",
        "what the song?", "what song was this", "what music is this", "what track is this", "what track is that",
        "whats the music", "whats this music", "can i get the song",
        "what the song you used", "what music was used", "what track even is that", "what music is on the video", "what the song is?",
        "whats the track in this", "what the song called", "what the song is called", "whats the song called",
        "what music is that", "what that music is", "what song is played", "what song was being played", "whats the title of the song",
        "whats the name of the song", "what the name of the song",
        "identify the song", "identify this song", "recognize this song", "what song is in the background",
        "what song did you use", "\nsong id?", "\nsong name?", "\nsong title?",
        "recognizesong", "u/auddbot", "u/find-song"
    ],
    DefiniteTriggers: [
        "u/recognizesong", "u/auddbot", "u/find-song",
    ],
    AntiTriggers: [
        "has been automatically removed", "your comment was removed", "I am a bot",
        "comment here with such low karma", "bot wants to find the best and worst bots", "i recognize this song",
        "whats the song about"
    ],
    MaxTriggerTextLength: 400,
    CommentsMinScore: 80,
    LiveStreamMinScore: 95,
}

const settingOptions: any = [
    {
        type: "string",
        name: "api_token",
        label: "AudD API token",
    },
    {
        type: "boolean",
        name: "identify_all_new_posts",
        label: "Identify music in all new posts (we recommend leaving this off)",
    },
    {
        type: "boolean",
        name: "scan_comments",
        label: "Scan new comments for !song, 'What's the song?', etc. (we recommend turning this on)",
    },
];

async function getJSON(URL: string) {
    const response = await fetch(URL);
    const data = await response.json();
    return data;
}

function getSkipFirstFromLink(url: string): number {
    let skip = 0;
    if (url.endsWith('.m3u8')) {
        return skip;
    }
    try {
        let u = new URL(url);
        let t = u.searchParams.get('t') || u.searchParams.get('time_continue') || u.searchParams.get('start');
        if (t) {
            t = t.toLowerCase().replace(/s/g, '');
            let tInt = 0;
            if (t.includes('m')) {
                const s = t.split('m');
                const tsInt = parseInt(s[1]);
                tInt += isNaN(tsInt) ? 0 : tsInt;
                if (s[0].includes('h')) {
                    const h = s[0].split('h');
                    const tmInt = parseInt(h[1]);
                    if (!isNaN(tmInt)) {
                        tInt += tmInt * 60;
                    }
                    const thInt = parseInt(h[0]);
                    if (!isNaN(thInt)) {
                        tInt += thInt * 60 * 60;
                    }
                } else {
                    const tmInt = parseInt(s[0]);
                    if (!isNaN(tmInt)) {
                        tInt += tmInt * 60;
                    }
                }
            } else {
                const tsInt = parseInt(t);
                if (!isNaN(tsInt)) {
                    tInt = tsInt;
                }
            }
            skip += tInt;
            console.log('skip:', skip);
        }
    } catch (err) {
        console.error(`Error occurred when trying to create new URL with "${url}"`);
        capture(err)
    }
    return skip;
}

function capture(e: any) {
    if (e instanceof Error) {
        console.error(e.message);
        console.error(Object.keys(e));
    } else {
        console.error('Error:', e);
    }
}

function timeStringToSeconds(s: string) {
    let list = s.split(':');
    if (list.length > 3) {
        throw new Error('too many : thingies');
    }
    let result = 0, multiplier = 1;
    for (let i = list.length - 1; i >= 0; i--) {
        let c = parseInt(list[i]);
        if (isNaN(c)) {
            throw new Error('Invalid number in time string');
        }
        result += c * multiplier;
        multiplier *= 60;
    }
    return result;
}

function secondsToTimeString(i: number, includeHours: boolean = false) {
    if (includeHours) {
        return `${String(i / 3600).padStart(2, '0')}:${String((i % 3600) / 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`;
    }
    return `${String(i / 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`;
}

function getTimeFromText(s: string) {
    s = replaceAll(s, ' - ', '');
    s = replaceAll(s,' @', ' ');
    s = replaceAll(s,'?', ' ');
    let words = s.split(' ');
    let Time = 0, TimeTo = 0, maxScore = 0;
    words.forEach(w => {
        let score = 0;
        let w2 = "";
        if (w.includes('-')) {
            w2 = w.split('-')[1];
            w = w.split('-')[0];
            score += 1;
        }
        w = w.replace(/s$/, '');
        w2 = w2.replace(/s$/, '');
        if (w.includes(':')) {
            score += 2;
        }
        if (score > maxScore) {
            try {
                let t = timeStringToSeconds(w);
                Time = t;
                TimeTo = timeStringToSeconds(w2); // if w2 is empty or not a correct time, TimeTo is 0
                maxScore = score;
            } catch (err) {
                // Ignoring this error for now
            }
        }
    });
    return [Time, TimeTo];
}

//const urlRegexSafe = require('url-regex-safe');
const markdownRegex = /\[[^\][]+]\((https?:\/\/[^()]+)\)/g

const urlRegexSafe2 = /(?:(?:(?:[a-z]+:)?\/\/)?|www\.)(?:localhost|(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?:(?:[a-fA-F\d]{1,4}:){7}(?:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){6}(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|:[a-fA-F\d]{1,4}|:)|(?:[a-fA-F\d]{1,4}:){5}(?::(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,2}|:)|(?:[a-fA-F\d]{1,4}:){4}(?:(?::[a-fA-F\d]{1,4}){0,1}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,3}|:)|(?:[a-fA-F\d]{1,4}:){3}(?:(?::[a-fA-F\d]{1,4}){0,2}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,4}|:)|(?:[a-fA-F\d]{1,4}:){2}(?:(?::[a-fA-F\d]{1,4}){0,3}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,5}|:)|(?:[a-fA-F\d]{1,4}:){1}(?:(?::[a-fA-F\d]{1,4}){0,4}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,6}|:)|(?::(?:(?::[a-fA-F\d]{1,4}){0,5}:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}|(?::[a-fA-F\d]{1,4}){1,7}|:)))(?:%[0-9a-zA-Z]{1,})?|(?:(?:[a-z\u00a1-\uffff0-9][-_]*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:northwesternmutual|travelersinsurance|vermögensberatung|vermögensberater|americanexpress|kerryproperties|sandvikcoromant|americanfamily|bananarepublic|cancerresearch|cookingchannel|kerrylogistics|weatherchannel|international|lifeinsurance|travelchannel|wolterskluwer|construction|lplfinancial|scholarships|versicherung|accountants|barclaycard|blackfriday|blockbuster|bridgestone|calvinklein|contractors|creditunion|engineering|enterprises|foodnetwork|investments|kerryhotels|lamborghini|motorcycles|olayangroup|photography|playstation|productions|progressive|redumbrella|williamhill|சிங்கப்பூர்|accountant|apartments|associates|basketball|bnpparibas|boehringer|capitalone|consulting|creditcard|cuisinella|eurovision|extraspace|foundation|healthcare|immobilien|industries|management|mitsubishi|nextdirect|properties|protection|prudential|realestate|republican|restaurant|schaeffler|tatamotors|technology|university|vlaanderen|volkswagen|accenture|alfaromeo|allfinanz|amsterdam|analytics|aquarelle|barcelona|bloomberg|christmas|community|directory|education|equipment|fairwinds|financial|firestone|fresenius|frontdoor|furniture|goldpoint|hisamitsu|homedepot|homegoods|homesense|institute|insurance|kuokgroup|lancaster|landrover|lifestyle|marketing|marshalls|melbourne|microsoft|panasonic|passagens|pramerica|richardli|shangrila|solutions|statebank|statefarm|stockholm|travelers|vacations|yodobashi|موريتانيا|abudhabi|airforce|allstate|attorney|barclays|barefoot|bargains|baseball|boutique|bradesco|broadway|brussels|budapest|builders|business|capetown|catering|catholic|cipriani|cityeats|cleaning|clinique|clothing|commbank|computer|delivery|deloitte|democrat|diamonds|discount|discover|download|engineer|ericsson|etisalat|exchange|feedback|fidelity|firmdale|football|frontier|goodyear|grainger|graphics|guardian|hdfcbank|helsinki|holdings|hospital|infiniti|ipiranga|istanbul|jpmorgan|lighting|lundbeck|marriott|maserati|mckinsey|memorial|merckmsd|mortgage|observer|partners|pharmacy|pictures|plumbing|property|redstone|reliance|saarland|samsclub|security|services|shopping|showtime|softbank|software|stcgroup|supplies|training|vanguard|ventures|verisign|woodside|yokohama|السعودية|abogado|academy|agakhan|alibaba|android|athleta|auction|audible|auspost|avianca|banamex|bauhaus|bentley|bestbuy|booking|brother|bugatti|capital|caravan|careers|channel|charity|chintai|citadel|clubmed|college|cologne|comcast|company|compare|contact|cooking|corsica|country|coupons|courses|cricket|cruises|dentist|digital|domains|exposed|express|farmers|fashion|ferrari|ferrero|finance|fishing|fitness|flights|florist|flowers|forsale|frogans|fujitsu|gallery|genting|godaddy|grocery|guitars|hamburg|hangout|hitachi|holiday|hosting|hoteles|hotmail|hyundai|ismaili|jewelry|juniper|kitchen|komatsu|lacaixa|lanxess|lasalle|latrobe|leclerc|limited|lincoln|markets|monster|netbank|netflix|network|neustar|okinawa|oldnavy|organic|origins|philips|pioneer|politie|realtor|recipes|rentals|reviews|rexroth|samsung|sandvik|schmidt|schwarz|science|shiksha|singles|staples|storage|support|surgery|systems|temasek|theater|theatre|tickets|tiffany|toshiba|trading|walmart|wanggou|watches|weather|website|wedding|whoswho|windows|winners|xfinity|yamaxun|youtube|zuerich|католик|اتصالات|البحرين|الجزائر|العليان|كاثوليك|پاکستان|இந்தியா|abarth|abbott|abbvie|africa|agency|airbus|airtel|alipay|alsace|alstom|amazon|anquan|aramco|author|bayern|beauty|berlin|bharti|bostik|boston|broker|camera|career|casino|center|chanel|chrome|church|circle|claims|clinic|coffee|comsec|condos|coupon|credit|cruise|dating|datsun|dealer|degree|dental|design|direct|doctor|dunlop|dupont|durban|emerck|energy|estate|events|expert|family|flickr|futbol|gallup|garden|george|giving|global|google|gratis|health|hermes|hiphop|hockey|hotels|hughes|imamat|insure|intuit|jaguar|joburg|juegos|kaufen|kinder|kindle|kosher|lancia|latino|lawyer|lefrak|living|locker|london|luxury|madrid|maison|makeup|market|mattel|mobile|monash|mormon|moscow|museum|mutual|nagoya|natura|nissan|nissay|norton|nowruz|office|olayan|online|oracle|orange|otsuka|pfizer|photos|physio|pictet|quebec|racing|realty|reisen|repair|report|review|rocher|rogers|ryukyu|safety|sakura|sanofi|school|schule|search|secure|select|shouji|soccer|social|stream|studio|supply|suzuki|swatch|sydney|taipei|taobao|target|tattoo|tennis|tienda|tjmaxx|tkmaxx|toyota|travel|unicom|viajes|viking|villas|virgin|vision|voting|voyage|vuelos|walter|webcam|xihuan|yachts|yandex|zappos|москва|онлайн|ابوظبي|ارامكو|الاردن|المغرب|امارات|فلسطين|مليسيا|भारतम्|இலங்கை|ファッション|actor|adult|aetna|amfam|amica|apple|archi|audio|autos|azure|baidu|beats|bible|bingo|black|boats|bosch|build|canon|cards|chase|cheap|cisco|citic|click|cloud|coach|codes|crown|cymru|dabur|dance|deals|delta|drive|dubai|earth|edeka|email|epson|faith|fedex|final|forex|forum|gallo|games|gifts|gives|glass|globo|gmail|green|gripe|group|gucci|guide|homes|honda|horse|house|hyatt|ikano|irish|jetzt|koeln|kyoto|lamer|lease|legal|lexus|lilly|linde|lipsy|loans|locus|lotte|lotto|macys|mango|media|miami|money|movie|music|nexus|nikon|ninja|nokia|nowtv|omega|osaka|paris|parts|party|phone|photo|pizza|place|poker|praxi|press|prime|promo|quest|radio|rehab|reise|ricoh|rocks|rodeo|rugby|salon|sener|seven|sharp|shell|shoes|skype|sling|smart|smile|solar|space|sport|stada|store|study|style|sucks|swiss|tatar|tires|tirol|tmall|today|tokyo|tools|toray|total|tours|trade|trust|tunes|tushu|ubank|vegas|video|vodka|volvo|wales|watch|weber|weibo|works|world|xerox|yahoo|ישראל|ایران|بازار|بھارت|سودان|سورية|همراه|भारोत|संगठन|বাংলা|భారత్|ഭാരതം|嘉里大酒店|aarp|able|adac|aero|akdn|ally|amex|arab|army|arpa|arte|asda|asia|audi|auto|baby|band|bank|bbva|beer|best|bike|bing|blog|blue|bofa|bond|book|buzz|cafe|call|camp|care|cars|casa|case|cash|cbre|cern|chat|citi|city|club|cool|coop|cyou|data|date|dclk|deal|dell|desi|diet|dish|docs|dvag|erni|fage|fail|fans|farm|fast|fiat|fido|film|fire|fish|flir|food|ford|free|fund|game|gbiz|gent|ggee|gift|gmbh|gold|golf|goog|guge|guru|hair|haus|hdfc|help|here|hgtv|host|hsbc|icbc|ieee|imdb|immo|info|itau|java|jeep|jobs|jprs|kddi|kiwi|kpmg|kred|land|lego|lgbt|lidl|life|like|limo|link|live|loan|loft|love|ltda|luxe|maif|meet|meme|menu|mini|mint|mobi|moda|moto|name|navy|news|next|nico|nike|ollo|open|page|pars|pccw|pics|ping|pink|play|plus|pohl|porn|post|prod|prof|qpon|read|reit|rent|rest|rich|room|rsvp|ruhr|safe|sale|sarl|save|saxo|scot|seat|seek|sexy|shaw|shia|shop|show|silk|sina|site|skin|sncf|sohu|song|sony|spot|star|surf|talk|taxi|team|tech|teva|tiaa|tips|town|toys|tube|vana|visa|viva|vivo|vote|voto|wang|weir|wien|wiki|wine|work|xbox|yoga|zara|zero|zone|дети|сайт|بارت|بيتك|تونس|شبكة|عراق|عمان|موقع|ڀارت|भारत|ভারত|ভাৰত|ਭਾਰਤ|ભારત|ଭାରତ|ಭಾರತ|ලංකා|アマゾン|クラウド|グーグル|ポイント|组织机构|電訊盈科|香格里拉|aaa|abb|abc|aco|ads|aeg|afl|aig|anz|aol|app|art|aws|axa|bar|bbc|bbt|bcg|bcn|bet|bid|bio|biz|bms|bmw|bom|boo|bot|box|buy|bzh|cab|cal|cam|car|cat|cba|cbn|cbs|ceo|cfa|cfd|com|cpa|crs|csc|dad|day|dds|dev|dhl|diy|dnp|dog|dot|dtv|dvr|eat|eco|edu|esq|eus|fan|fit|fly|foo|fox|frl|ftr|fun|fyi|gal|gap|gay|gdn|gea|gle|gmo|gmx|goo|gop|got|gov|hbo|hiv|hkt|hot|how|ibm|ice|icu|ifm|inc|ing|ink|int|ist|itv|jcb|jio|jll|jmp|jnj|jot|joy|kfh|kia|kim|kpn|krd|lat|law|lds|llc|llp|lol|lpl|ltd|man|map|mba|med|men|mil|mit|mlb|mls|mma|moe|moi|mom|mov|msd|mtn|mtr|nab|nba|nec|net|new|nfl|ngo|nhk|now|nra|nrw|ntt|nyc|obi|one|ong|onl|ooo|org|ott|ovh|pay|pet|phd|pid|pin|pnc|pro|pru|pub|pwc|red|ren|ril|rio|rip|run|rwe|sap|sas|sbi|sbs|sca|scb|ses|sew|sex|sfr|ski|sky|soy|spa|srl|stc|tab|tax|tci|tdk|tel|thd|tjx|top|trv|tui|tvs|ubs|uno|uol|ups|vet|vig|vin|vip|wed|win|wme|wow|wtc|wtf|xin|xxx|xyz|you|yun|zip|бел|ком|мкд|мон|орг|рус|срб|укр|қаз|հայ|קום|عرب|قطر|كوم|مصر|कॉम|नेट|คอม|ไทย|ລາວ|みんな|ストア|セール|中文网|亚马逊|天主教|我爱你|新加坡|淡马锡|诺基亚|飞利浦|ac|ad|ae|af|ag|ai|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|ss|st|su|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|uk|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|za|zm|zw|ελ|ευ|бг|ею|рф|გე|コム|世界|中信|中国|中國|企业|佛山|信息|健康|八卦|公司|公益|台湾|台灣|商城|商店|商标|嘉里|在线|大拿|娱乐|家電|广东|微博|慈善|手机|招聘|政务|政府|新闻|时尚|書籍|机构|游戏|澳門|点看|移动|网址|网店|网站|网络|联通|谷歌|购物|通販|集团|食品|餐厅|香港|닷넷|닷컴|삼성|한국)))(?::\d{2,5})?(?:[/?#][^\s"'()\]]*)?/gi

function linksFromBody(body: string | undefined) {
    if (!body) {
        return [];
    }
    let results = Array.from(body.matchAll(markdownRegex));
    let plaintextUrls: any[] = body.match(urlRegexSafe2) || [];
    plaintextUrls = plaintextUrls.map(url => url.replace(/\\/, ''));
    plaintextUrls.forEach(url => results.push([url, url]));
    return results;
}

// commentTree is []Comment

async function getVideoLink(comment: Comment, metadata?: Metadata) {
    let post;
    if (!comment) {
        throw new Error("Empty comment");
    }
    let parentId;
    const commentsTree = [];

    parentId = comment.parentId;
    commentsTree.push(comment);

    let postId: any = parentId;
    while (parentId !== "") {
        postId = parentId;
        let parent;
        if (parentId.startsWith("t3_")) {
            parent = await reddit.getPostById(parentId, metadata);
        } else if (parentId.startsWith("t1_")) {
            parent = await reddit.getCommentById(parentId, metadata);
        }

        const j = JSON.stringify(parent);
        console.log(`parent [${parentId}]: ${j}`);

        if (parent) {
            if (parent instanceof Post) {
                post = parent;
                parentId = "";
                break;
            } else if (parent instanceof Comment) {
                commentsTree.push(parent);
                parentId = parent.parentId;
            } else {
                throw new Error(`Got a result that's neither a post nor a comment, parent ID ${parentId}, ${JSON.stringify(parent)}`);
            }
        } else {
            parentId = "";
        }
    }
    let link;
    try {
        link = await getLinkFromComment(commentsTree, post);
    } catch (err) {
        capture(err);
        throw err;
    }
    return {
        link,
        postId_: String(postId),
    };
}







async function getLinkFromComment(commentsTree: Comment[]|undefined, post: Post | undefined) {
    let resultUrl = post ? post.url : '';
    let mention;

    if (resultUrl.includes("reddit.com/rpan")) {
        const s = resultUrl.split("/");
        const jsonUrl = "https://strapi.reddit.com/videos/t3_" + s[s.length - 1];
        try {
            const page = await getJSON(jsonUrl);
            resultUrl = page.data.stream.hls_url;
            if (resultUrl) {
                return resultUrl;
            }
        } catch (err) {
            capture(err);
            throw err;
        }
    }

    if(!commentsTree) {
        commentsTree = [];
    }

    if (commentsTree.length > 0 && commentsTree[0]) {
        if (!resultUrl) {
            resultUrl = ''; // There may be a specific URL you need to retrieve here
        }
        mention = commentsTree[0]; // This is the equivalent of 'commentToMessage' function
        commentsTree = commentsTree.slice(1); // Remove first comment
    } else {
        if (!post) {
            throw new Error("mention, commentsTree, and post are all nil");
        }
    }

    if (!resultUrl) {
        if(!post) {
            console.log("Got empty post");
        } else {
            console.log(`Got a post that's not a link or an empty post (https://www.reddit.com${post.permalink}, ${JSON.stringify(post)})`);
            resultUrl = `https://www.reddit.com${post.permalink}`;
        }
    }

    if (resultUrl.includes("reddit.com/") || !resultUrl) {
        if (post && post.body && post.body.includes(`https://reddit.com/link/${post.id}/video/`)) {
            let s = post.body.split(`https://reddit.com/link/${post.id}/video/`);
            s = s[1].split("/");
            resultUrl = `https://v.redd.it/${s[0]}/`;
        }
    }

    // Use links:
    let results: any[] = [];
    if (mention) {
        results = results.concat(linksFromBody(mention.body)); // from the first comment
    }
    if (commentsTree.length > 0 && commentsTree[0]) {
        results = results.concat(linksFromBody(commentsTree[0].body)); // from the second comment
    }
    if (!resultUrl.includes("reddit.com/") && resultUrl) {
        results.push([resultUrl, resultUrl]); // that's the post link
    }
    if (post) {
        results = results.concat(linksFromBody(post.body)); // from the post body
    }

    if (results.length !== 0) {
        console.log("Parsed from the text:", results);
        for (let u of results) {
            if (u[1].startsWith("/") || u[1].startsWith("https://www.reddit.com/")) {
                continue;
            }
            resultUrl = u[1];
            break;
        }
    }

    if (resultUrl.includes("reddit.com/")) {
        const jsonUrl = resultUrl + ".json";
        try {
            const page = await getJSON(jsonUrl);
            if (page.length > 0 && page[0].data.children.length > 0) {
                if (page[0].data.children[0].data.rpan_video.hls_url) {
                    resultUrl = page[0].data.children[0].data.rpan_video.hls_url;
                } else if (page[0].data.children[0].data.url.includes("v.redd.it")) {
                    resultUrl = page[0].data.children[0].data.url;
                } else if (page[0].data.children[0].data.media_metadata) {
                    for (let s in page[0].data.children[0].data.media_metadata) {
                        resultUrl = `https://v.redd.it/${s}/`;
                    }
                }
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    return resultUrl;
}



function substringInSlice(s: string, slice: string[]): boolean {
    for (let i = 0; i < slice.length; i++) {
        if (s.includes(slice[i])) {
            return true;
        }
    }
    return false;
}

function getBodyToCompare(body: string): string {
    return "\n" + body.toLowerCase().replace("'", "").replace("’", "").replace("`", "").replace("what is", "whats") + "?";
}



const enterpriseChunkLength = 12;

/*
{"id":"t3_14l5jey","authorId":"t2_r7f65","authorName":"Mihonarium","subredditId":"t5_8pnuvo","subredditName":"SongIDTest",
"permalink":"/r/SongIDTest/comments/14l5jey/whats_up_with_post_bodies/","title":"What's up with post bodies?",
"body":"Test test test\n\nreoegeoj\n\nreoegeoj\n\nreoegeoj\n\nreoegeoj\n\n[https://www.youtube.com/watch?v=xcASh3kdKp0](https://www.youtube.com/watch?v=xcASh3kdKp0)",
"url":"https://www.reddit.com/r/SongIDTest/comments/14l5jey/whats_up_with_post_bodies/","score":1,"numberOfComments":5,"numberOfReports":0,
"createdAt":"2023-06-28T10:12:20.000Z","approved":true,"spam":false,"stickied":false,"removed":false,"archived":false,"edited":false,
"locked":false,"nsfw":false,"quarantined":false,"spoiler":false,"hidden":false,"ignoringReports":false}
 */

async function HandleQuery(comment: Comment|undefined, post: Post|undefined, sendPublicly: boolean, summoned: boolean, metadata?: Metadata): Promise<{response: string, additional_low_confidence: string}> {
    let resultUrl, t, parentID, body, subreddit, author, permalink, postId: string;
    if (comment) {
        t = "comment";
        parentID = comment.id;
        body = comment.body;
        // subreddit = comment.subredditName;
        author = comment.authorName;
        permalink = comment.permalink;
        postId = "";
    } else {
        if(!post) {
            console.log("Got empty comment and post");
            return Promise.resolve({response: "", additional_low_confidence: ""});
        }
        t = "post";
        parentID = post.id;
        body = post.body;
        subreddit = post.subredditName;
        author = post.authorName;
        permalink = post.permalink;
        postId = post.id;
    }
    console.log(t, parentID, body, subreddit, author, permalink, postId);
    if(!body) {
        console.log("Got empty body");
        body = "";
    }
    body = body.toLowerCase();
    const rs = body.includes("recognizesong");
    summoned = summoned || rs || body.includes("auddbot");
    if (body.length > Config.MaxTriggerTextLength && Config.MaxTriggerTextLength !== 0 && !summoned) {
        console.log("The comment is too long, skipping", body);
        return Promise.resolve({response: "", additional_low_confidence: ""});
    }
    // todo: avoid duplicates
    if(post) {
        try {
            resultUrl = await getLinkFromComment(undefined, post);
        } catch (err) {
            capture(err);
            return Promise.resolve({response: "", additional_low_confidence: ""});
        }
    } else if(comment) {
        try {
            const { link, postId_ } = await getVideoLink(comment, metadata);
            resultUrl = link;
            postId = postId_;
        } catch (err) {
            capture(err);
            return Promise.resolve({response: "", additional_low_confidence: ""});
        }
    }
    if(!resultUrl) {
        console.log("Got empty resultUrl");
        return Promise.resolve({response: "", additional_low_confidence: ""});
    }
    if(resultUrl.includes("https://lis.tn/")) {
        console.log("Skipping a reply to our comment");
        return Promise.resolve({response: "", additional_low_confidence: ""});
    }
    // ToDo: if the link hasn't changed since the previous call, ignore
    console.log(resultUrl);
    let limit = 2;
    if(resultUrl.includes("v.redd.it")) {
        limit = 3;
    }
    const isLivestream = resultUrl.endsWith(".m3u8");
    if(isLivestream) {
        console.log("\nGot a livestream", resultUrl);
        if(summoned) {
            const reply = "I'll listen to the next " + enterpriseChunkLength + " seconds of the stream and try to identify the song";
            if(sendPublicly) {
                reddit.submitComment({text: reply, id: parentID as string}, metadata);
            } else {
               // reddit.sendPrivateMessage({subject: "Song ID: Listening", text: reply, to: metadata.}, metadata); //todo
            }
        }
        limit = 1;
    }
    // ToDo: allow defining the limit, minscore, withlinks, etc. in the subreddit config
    let minScore = Config.CommentsMinScore;
    if(isLivestream) {
        minScore = Config.LiveStreamMinScore;
    }
    const withLinks = !body.includes("without links") && !body.includes("/wl") || isLivestream;
    let timestampTo = 0;
    let timestamp = getSkipFirstFromLink(resultUrl);
    if(timestamp === 0) {
        const [timestamp_, timestampTo_ ] = getTimeFromText(body);
        timestamp = timestamp_;
        timestampTo = timestampTo_;
    }
    if(timestampTo !== 0 && timestampTo - timestamp > limit * enterpriseChunkLength) {
        // recognize music at the middle of the specified interval
        timestamp += (timestampTo - timestamp - limit * enterpriseChunkLength) / 2;
    }
    timestampTo = timestamp + limit * enterpriseChunkLength;
    let atTheEnd = "false";
    if(timestamp === 0 && body.includes("at the end") && !isLivestream) {
        atTheEnd = "true";
    }
    let APIresult: Result;
    try {
        APIresult = ConvertToEnterpriseResult(await AudDRequest("https://enterprise.audd.io/", {
            url: resultUrl,
            api_token: (getSetting(
                "api_token",
                metadata
            )) as unknown as string,
            limit: limit,
            skip_first_seconds: timestamp,
            reversed_order: atTheEnd,
            accurate_offsets: true,
        }));
    } catch (err) {
        capture(err);
        return Promise.resolve({response: "Error while sending a Music ID request, sorry :(", additional_low_confidence: "error"});
    }
    const useFormatting = false; // todo use the config
    let response = GetReply(APIresult, withLinks, true, !isLivestream, false, minScore)
    if(!APIresult.status) {
        console.error("No status in the response", APIresult);
        return Promise.resolve({response: "", additional_low_confidence: ""});
    }
    if(APIresult.status === "error") {
        if(!APIresult.error) {
            console.error("No error in the erorr response", APIresult);
            return Promise.resolve({response: "", additional_low_confidence: ""});
        }
        if (APIresult.error.error_code === 501) {
            response = `Sorry, I couldn't get any audio from the [link](${resultUrl})`;
            if(resultUrl.includes("youtube.com") || resultUrl.includes("youtu.be")) {
                response += ". \n\nSometimes I have trouble with YouTube videos, and don't work for long (usually 1.5h+) videos or ones that are geo-blocked/age-gated. If relevant also note that I don't work for YouTube Clips - I need the direct link to the video and the timestamp, for example `https://youtu.be/AbCdEfGhI at 1:48` or timestamped like `https://youtu.be/AbCdEfGhI?t=1m48s`.";
            }
            if(!summoned) {
                console.log("not summoned and couldn't get any audio, exiting");
                return Promise.resolve({response: "", additional_low_confidence: ""});
            }
        }
        if(response === "") {
            console.log(APIresult.error);
            return Promise.resolve({response: "", additional_low_confidence: ""});
        }
    }
    let result = ConvertToEnterpriseResult(APIresult).result;
    if(!result) {
        console.error("No result in the response", APIresult);
        return Promise.resolve({response: "", additional_low_confidence: ""});
    }
    const footerLinks = [
        "*I am a bot and this action was performed automatically*",
        "[GitHub](https://github.com/AudDMusic/RedditBot) " +
        "[^(new issue)](https://github.com/AudDMusic/RedditBot/issues/new)",
        "[Donate](https://github.com/AudDMusic/RedditBot/wiki/Please-consider-donating)",
    //"[Feedback](/message/compose?to=Mihonarium&subject=Music%20recognition%20" + parentID + ")"
    ];
    // todo: save to the possible duplicates thing
    const donateLink = 2;
    let highestScore = 0;
    result.forEach(results => {
        results.songs.forEach(song => {
            if (song.score > highestScore) {
                highestScore = song.score;
            }
        });
    });
    const shoutOutToPatreonSupporter = getPatreonSupporter(summoned, highestScore === 100);
    // todo: add settings for custom messages
    if (shoutOutToPatreonSupporter !== "") {
        footerLinks[2] += " ^(Music recognition costs a lot. This result was brought to you by our Patreon supporter, " +
            shoutOutToPatreonSupporter + ")";
    } else {
        if (highestScore === 100) {
            footerLinks[2] += " ^(Please consider supporting me on Patreon. Music recognition costs a lot)";
        }
    }
    if (highestScore < 100 && !isLivestream) {
        footerLinks[0] += " | If the matched percent is less than 100, it could be a false positive result. " +
            "I'm still posting it, because sometimes I get it right even if I'm not sure, so it could be helpful.";
    }
    if (result.length === 0) { // also config
        footerLinks.splice(donateLink, 1);
    }
    const footer = "\n\n" + footerLinks.join(" | ");
    if (isLivestream) {
        console.log("\nStream results:", result);
    }
    if (response === "") {
        let at = secondsToTimeString(timestamp, timestampTo >= 3600) + "-" + secondsToTimeString(timestampTo, timestampTo >= 3600);
        if (atTheEnd === "true") {
            at = "the end";
        }
        response = `Sorry, I couldn't recognize the song. I tried to identify music from the [link](${resultUrl}) at ${at}.`;
        if(resultUrl.includes("https://www.reddit.com/")) {
            response = "Sorry, I couldn't get the video URL from the post or your comment.";
        }
    }
    if (withLinks) {
        response += footer;
    }
    if (!useFormatting) {
        response = removeFormatting(response);
    }
    // todo: check if configured to send low confidence results
    let lowConfidenceResultMessage = "";
    if (summoned && result.length > 0 && APIresult.status == "success") {
        let lowConfidenceResult: ResultItem[] = [];
        result.forEach(results => {
            if (results.songs[0].score < minScore) {
                lowConfidenceResult.push(results);
            }
        });
        if (lowConfidenceResult.length > 0) {
            lowConfidenceResultMessage = GetReply(lowConfidenceResult, true, true, false, true, 0);
            lowConfidenceResultMessage = "In reply to your [Song ID request](https://reddit.com" + permalink + "), " +
                "I'm also sending some additional low-confidence results (likely to be false-positives, but sharing just in case):\n\n" + lowConfidenceResultMessage;
        }
    }
    // return response and the low confidence result message. It should be a Promise<{response: string, additional_low_confidence: string}>
    return Promise.resolve({response: response, additional_low_confidence: lowConfidenceResultMessage});
}

function removeFormatting(response: string): string {
    response = replaceAll(response,"**", "*");
    response = replaceAll(response,"*", "\\*");
    response = replaceAll(response,"`", "'");
    response = replaceAll(response,"^", "");
    return response;
}

function getPatreonSupporter(summoned: boolean, perfectMatch: boolean): string {
    //todo
    console.log("getPatreonSupporter", summoned, perfectMatch)
    return "";
}

type Result = {
    status: string,
    result?: ResultItem[],
    error?: APIError,
    execution_time: string,
}
type APIError = {
    error_code: number,
    error_message: string,
}
type ResultItem = {
    songs: Song[],
    offset: string,
}
type Song = {
    title: string,
    artist: string,
    album: string,
    release_date: string,
    label: string,
    score: number,
    timecode: string,
    isrc: string,
    upc: string,
    song_link: string,
}

function ConvertToEnterpriseResult(result: any): Result {
    const defaultResult: Result = {
        status: '',
        execution_time: '',
        result: [],
        error: { error_code: 0, error_message: '' },
    };

    return { ...defaultResult, ...result };
}

function GetReply(APIresult: any, withLinks: boolean, matched: boolean, full: boolean, showLabel: boolean, minScore: number): string {
    let result = ConvertToEnterpriseResult(APIresult).result;
    if(!result) {
        return "";
    }
    if (result.length === 0) {
        return "";
    }

    let links: any = {};
    const texts: string[] = [];
    let numResults = 0;

    result.forEach(results => {
        results.songs.forEach(song => {
            if (song.score >= minScore) {
                numResults++;
            }
        });
    });

    result.forEach(results => {
        if (results.songs.length === 0) {
            console.error("enterprise response has a result without any songs");
        }

        results.songs.forEach(song => {
            if (song.score < minScore) {
                return;
            }

            if (song.song_link === "https://lis.tn/rvXTou" || song.song_link === "https://lis.tn/XIhppO") {
                song.artist = "The Caretaker (Leyland James Kirby)";
                song.title = "Everywhere at the End of Time - Stage 1";
                song.album = "Everywhere at the End of Time - Stage 1";
                song.release_date = "2016-09-22";
                song.song_link = "https://www.youtube.com/watch?v=wJWksPWDKOc";
            }

            song.song_link = song.song_link.replace(new RegExp("https://www.youtube.com/watch\\?v=", 'g'), "https://lis.tn/yt/");
            song.song_link = song.song_link.replace(new RegExp("https://youtube.com/watch\\?v=", 'g'), "https://lis.tn/yt/");
            song.song_link = song.song_link.replace(new RegExp("https://youtu.be/", 'g'), "https://lis.tn/yt/");

            if (song.song_link !== "") {
                if (links[song.song_link]) {
                    return;
                }
                links[song.song_link] = true;
            }

            // Assumes we have functions for profanity and markdown replacement.
            song.title = maskProfanity(song.title);
            song.artist = maskProfanity(song.artist);
            song.album = maskProfanity(song.album);
            song.label = maskProfanity(song.label);
            song.title = escapeMarkdown(song.title);
            song.artist = escapeMarkdown(song.artist);
            song.album = escapeMarkdown(song.album);
            song.label = escapeMarkdown(song.label);

            if (song.timecode.includes(":")) {
                const ms = song.timecode.split(":");
                const m = parseInt(ms[0]);
                const s = parseInt(ms[1]);
                song.song_link += "?t=" + (m * 60 + s).toString();
            }

            const score = `${song.score}%`;
            let text = `**${song.title}** by ${song.artist}`;
            if (withLinks) {
                text = `[${text}](${song.song_link})`;
            }
            let scoreInfo = "";
            if (matched) {
                text += ` (${song.timecode}; matched: \`${score}\`)`;
                scoreInfo = `\n\n**Score:** ${score} (timecode: ${song.timecode})`;
            }

            if (numResults === 1 && full) {
                text = `**Name:** ${song.title}\n\n**Artist:** ${song.artist}${scoreInfo}`;
                text += `\n\n**Album:** ${song.album}\n\n**Label:** ${song.label}\n\n**Released on:** ${song.release_date}`;
                if (withLinks) {
                    text += `\n\n[Apple Music, Spotify, YouTube, etc.](${song.song_link})`;
                }
            }

            if (full && numResults > 1) {
                let album = "";
                let label = "";
                let releaseDate = "";
                if (song.title !== song.album && song.album !== "") {
                    album = "**Album**: " + song.album + ". ";
                }
                if (song.artist !== song.label && song.label !== "Self-released" && song.label !== "") {
                    if (showLabel) {
                        label = " **by** " + song.label;
                    }
                }
                if (song.release_date !== "") {
                    releaseDate = "**Released on** " + song.release_date;
                } else {
                    if (label !== "") {
                        label = "**Label**: " + song.label;
                    }
                }
                if (![album, label, releaseDate].every(x => x === "")) {
                    text += `\n\n${album}${releaseDate}${label}.`;
                }
            }

            texts.push(text);
        });
    });

    if (texts.length === 0) {
        return "";
    }

    let response = texts[0];
    if (texts.length > 1) {
        response = "";
        if (full) {
            response = "I got matches with these songs:";
        }
        texts.forEach(text => {
            response += `\n\n• ${text}`;
        });
    } else {
        if (full) {
            response = "**Song Found!**\n\n" + response;
        }
    }
    return response;
}


function AudDRequest(url: string, params: any) {
    return fetch(url, {
        method: "POST",
        body: JSON.stringify(params),
        headers: {
            "Content-Type": "application/json",
        },
    }).then((res) => res.json());
}



Devvit.addSettings(settingOptions);

/**
 * Declare the custom actions we'd like to add to the subreddit
 */
Devvit.addAction({
    context: Context.POST,
    name: 'Identify music', // text to display in the menu (keep it short!)
    description: 'Identify the song playing in a video or linked audio', // short blurb describing what we're going to do
    handler: async (event, metadata?: Metadata) => {
        const postId = event.post.name as string;
        console.log(JSON.stringify(event));
        const postInfo = await reddit.getPostById(postId, metadata);
        const message = `Post action! Post ID: ${event.post?.id}`;
        console.log(message);
        console.log(metadata);
        console.log(event.post);
        console.log(JSON.stringify(postInfo));
        console.log(postInfo.body);
        let user = await reddit.getCurrentUser(metadata)
        let result = await HandleQuery(undefined, postInfo, false, false, metadata)
        if(result.additional_low_confidence != "error" && result.response != "") {
            await reddit.sendPrivateMessage({subject: "Music ID results", text: result.response, to: user.username}, metadata);
            if (result.additional_low_confidence != "") {
                await reddit.sendPrivateMessage({subject: "Additional low-confidence music ID results", text: result.additional_low_confidence, to: user.username}, metadata);
            }
        }
        return { success: result.response != "" && result.additional_low_confidence != "", message: result.response};
    },
});

Devvit.addAction({
    context: Context.COMMENT,
    name: 'Identify linked music', // text to display in the menu (keep it short!)
    description: 'Identify the song playing in a linked video or audio', // short blurb describing what we're going to do
    handler: async (event, metadata?: Metadata) => {
        const commentId = event.comment.name as string;
        console.log(JSON.stringify(event));
        const commentInfo = await reddit.getCommentById(commentId, metadata);
        console.log(commentInfo.body);
        console.log(JSON.stringify(commentInfo));
        console.log(await getVideoLink(commentInfo, metadata));
        const message = `Comment action! Comment ID: ${event.comment?.id}`;
        console.log(message);
        let user = await reddit.getCurrentUser(metadata)
        let result = await HandleQuery(commentInfo, undefined, false, false, metadata)
        if(result.additional_low_confidence != "error" && result.response != "") {
            await reddit.sendPrivateMessage({subject: "Music ID results", text: result.response, to: user.username}, metadata);
            if (result.additional_low_confidence != "") {
                await reddit.sendPrivateMessage({subject: "Additional low-confidence music ID results", text: result.additional_low_confidence, to: user.username}, metadata);
            }
        }
        return { success: result.response != "" && result.additional_low_confidence != "", message: result.response};
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.CommentSubmit,
    async handler(request: CommentSubmit, metadata?: Metadata) {
        if (request.author?.id === getFromMetadata(Header.AppUser, metadata)) {
            console.log('hey! my app created this comment; not going to respond');
            return;
        }
        console.log(`Received OnCommentSubmit event:\n${JSON.stringify(request)}`);
        if(!request.comment) {
            console.log("Got empty comment");
            return;
        }
        const text = request.comment.body;
        const compare = getBodyToCompare(text);
        if (!substringInSlice(compare, Config.Triggers)) {
            return;
        }
        let scanComments = getSetting(
            "scan_comments",
            metadata
        ) as unknown as boolean;
        if(!scanComments && !substringInSlice(compare, Config.DefiniteTriggers)) {
            return;
        }
        if (substringInSlice(compare, Config.AntiTriggers)) {
            console.log("Got an anti-trigger", text);
            return;
        }
        // todo: check if already processed
        const comment = await reddit.getCommentById(request.comment.id as string, metadata);
        HandleQuery(comment, undefined, true, false, metadata).then(async (result) => {
            if (result.response) {

                await reddit.submitComment({richtext: result.response, id: comment.id}, metadata);
            }
            if (result.additional_low_confidence) {
                await reddit.sendPrivateMessage({subject: "Some additional low-confidence results", text: result.additional_low_confidence, to: comment.authorName}, metadata);
            }
        }).catch((err) => {
            capture(err);
        });
    },
});

// Logging on a PostSubmit event
Devvit.addTrigger({
    event: Devvit.Trigger.PostSubmit,
    async handler(request: PostSubmit, metadata?: Metadata) {
        console.log(JSON.stringify(request));
        console.log(`Received OnPostSubmit event:\n${JSON.stringify(request)}`);
        let identifyOnAllPosts = getSetting(
            "identify_all_new_posts",
            metadata
        ) as unknown as boolean;

        if(!request.post) {
            console.log("Got empty post");
            return;
        }

        const text = request.post.selftext;
        const compare = getBodyToCompare(text);
        if (!substringInSlice(compare, Config.Triggers) && !identifyOnAllPosts) {
            return;
        }
        if (substringInSlice(compare, Config.AntiTriggers)) {
            console.log("Got an anti-trigger", text);
            return;
        }

        const post = await reddit.getPostById(request.post.id as string, metadata);
        HandleQuery(undefined, post, true, false, metadata).then(async (result) => {
            if (result.response) {
                await reddit.submitComment({richtext: result.response, id: post.id}, metadata);
            }
            if (result.additional_low_confidence) {
                await reddit.sendPrivateMessage({subject: "Some additional low-confidence results", text: result.additional_low_confidence, to: post.authorName}, metadata);
            }
        }).catch((err) => {
            capture(err);
        });
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.AppInstall,
    async handler(request: AppInstall) {
        console.log(`Received AppInstall event:\n${JSON.stringify(request)}`);
    },
});

Devvit.addTrigger({
    event: Devvit.Trigger.AppUpgrade,
    async handler(request: AppUpgrade) {
        console.log(`Received AppUpgrade event:\n${JSON.stringify(request)}`);
    },
});

function escapeRegExp(string: string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function replaceAll(str: string, find: string, replace: string): string {
    const escapedFind = escapeRegExp(find);
    return str.replace(new RegExp(escapedFind, 'g'), replace);
}

function maskProfanity(text: string): string {
    return text;
    // todo: implement
}

function escapeMarkdown(text: string) {
    // Escape backslash escapes!
    text = text.replace(/\\(\S)/g, '\\\\$1');

    // Escape headings
    text = text.replace(/^(#{1,6} )/gm, '\\$1');

    // Escape hr
    text = text.replace(/^([-*_] *){3,}$/gm, (match: string) => {
        if (match.includes("-")) {
            return match.replace(/-/g, '\\-');
        } else if (match.includes("_")) {
            return match.replace(/_/g, '\\_');
        }
        return match.replace(/\*/g, '\\*');
    });

    // Escape ol bullet points
    text = text.replace(/(\W* {0,3})(\d+)\. /gm, '$1$2\\. ');

    // Escape ul bullet points
    text = text.replace(/([^\\\w]*)[*+-] /gm, (match) => {
        return match.replace(/([*+-])/g, '\\$1');
    });

    // Escape blockquote indents
    text = text.replace(/(\W* {0,3})> /gm, '$1\\> ');

    // Escape em/strong *, em/strong _, code _
    ['*', '_', '`'].forEach(character => {
        const escaped = '\\' + character;
        text = text.split(character).join(escaped);
    });

    // Escape link brackets
    text = text.replace(/[\[\]]/g, '\\$&');

    return text;
}

export default Devvit;